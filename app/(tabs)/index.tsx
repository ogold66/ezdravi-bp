import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import MedicationCard from '../../components/MedicationCard'; 
import colors from '@/components/colors'; 
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { useRouter, useFocusEffect } from 'expo-router'; 
import * as SecureStore from 'expo-secure-store';
import { db } from '../../db'; 
import { medicationPlans, inventory, medicationLogs, diseases, visits, users } from '../../db/schema'; // <--- PŘIDÁNI USERS

export default function HomeScreen() {
  const router = useRouter(); 
  
  // STAVY PRO UŽIVATELE
  const [userName, setUserName] = useState('');
  const [activeUserId, setActiveUserId] = useState<number | null>(null);

  const [regularMeds, setRegularMeds] = useState<any[]>([]);
  const [sosMeds, setSosMeds] = useState<any[]>([]);
  const [upcomingVisits, setUpcomingVisits] = useState<any[]>([]); 
  const [isLoading, setIsLoading] = useState(true);

  const [showAmountPicker, setShowAmountPicker] = useState(false);
  const [activeSosMed, setActiveSosMed] = useState<any>(null);
  const [sosAmount, setSosAmount] = useState('1');
  const [showAddMenu, setShowAddMenu] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // 1. ZJISTÍME, KDO JE ZROVNA PŘIHLÁŠENÝ (VYBRANÝ)
      const storedId = await SecureStore.getItemAsync('activeUserId');
      let currentUserId = storedId ? Number(storedId) : null;

      // Pokud náhodou není nic uloženo, vezmeme prvního uživatele z databáze
      if (!currentUserId) {
        const allUsers = await db.select().from(users);
        if (allUsers.length > 0) {
          currentUserId = allUsers[0].user_id;
          await SecureStore.setItemAsync('activeUserId', currentUserId.toString());
        } else {
          setIsLoading(false);
          return; 
        }
      }
      
      setActiveUserId(currentUserId);

      // Zjistíme jméno uživatele pro pozdrav
      const currentUserData = await db.select().from(users).where(eq(users.user_id, currentUserId));
      if (currentUserData.length > 0) {
        setUserName(currentUserData[0].name);
      }

      // 2. NAČTEME LÉKY POUZE PRO TOHOTO UŽIVATELE
      const todayDay = (new Date().getDay() || 7).toString(); 
      
      const allMeds = await db
        .select({
          plan_id: medicationPlans.plan_id,
          inventory_id: medicationPlans.inventory_id,
          doses_config: medicationPlans.doses_config,
          is_sos: medicationPlans.is_sos,
          interval_hint: medicationPlans.interval_hint,
          end_date: medicationPlans.end_date, 
          medication_name: inventory.medication_name,
          remaining_qty: inventory.remaining_qty,
          unit: inventory.unit,
          form: inventory.form,
          diseaseName: diseases.disease_name 
        })
        .from(medicationPlans)
        .innerJoin(inventory, eq(medicationPlans.inventory_id, inventory.inventory_id))
        .leftJoin(diseases, eq(medicationPlans.disease_id, diseases.disease_id))
        .where(eq(medicationPlans.user_id, currentUserId));

      const regular: any[] = [];
      const sos: any[] = [];

      allMeds.forEach(med => {
        if (med.end_date !== null) return; 

        if (med.is_sos) {
          sos.push(med);
        } else {
          try {
            const config = JSON.parse(med.doses_config);
            if (config.some((schedule: any) => schedule.days.includes(todayDay))) {
              regular.push(med);
            }
          } catch (e) {}
        }
      });

      setRegularMeds(regular);
      setSosMeds(sos);

      // 3. NAČTEME NÁVŠTĚVY POUZE PRO TOHOTO UŽIVATELE
      const allVisits = await db.select().from(visits).where(eq(visits.user_id, currentUserId)); 
      const futureVisits = allVisits
        .filter((v: any) => v.status !== 'COMPLETED' && v.date && new Date(v.date) >= new Date(new Date().setHours(0,0,0,0)))
        .sort((a: any, b: any) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime())
        .slice(0, 2); 
      
      setUpcomingVisits(futureVisits);

    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const handleTakeSosClick = (med: any) => {
    // Ochranná logika při vyčerpání zásoby (při dalším pokusu o užití)
    if (med.remaining_qty <= 0) {
      Alert.alert(
        'Prázdná krabička!', 
        `Lék ${med.medication_name} už došel. Chcete prázdnou krabičku rovnou vyřadit do historie a vybrat z lékárničky novou?`,
        [
          { text: 'Zrušit', style: 'cancel' },
          { 
            text: 'Vyřadit a změnit zdroj', 
            style: 'default',
            onPress: async () => {
              await db.update(inventory).set({ status: 'DEPLETED', depleted_at: new Date().toISOString() }).where(eq(inventory.inventory_id, med.inventory_id));
              router.push({ pathname: '/medication-detail', params: { id: med.plan_id } });
            }
          }
        ]
      );
      return;
    }
    setActiveSosMed(med);
    setSosAmount('1'); 
    setShowAmountPicker(true);
  };

  const confirmTakeSos = async () => {
    const amount = parseFloat(sosAmount.replace(',', '.')) || 0;
    
    if (amount <= 0) {
      Alert.alert('Chyba', 'Množství musí být větší než 0.');
      return;
    }
    
    if (amount > activeSosMed.remaining_qty) {
      Alert.alert('Málo zásob', `V lékárničce máš už jen ${activeSosMed.remaining_qty} ${activeSosMed.unit}. Tolik si jich vzít nemůžeš.`);
      return;
    }

    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // Vytvoření nezvratného záznamu o užití léku
      await db.insert(medicationLogs).values({
        plan_id: activeSosMed.plan_id,
        inventory_id: activeSosMed.inventory_id,
        scheduled_date: todayStr,
        scheduled_time: timeStr,
        taken_at: now.toISOString(),
        amount: amount, 
        status: 'TAKEN'
      });

      // Snížení skladové zásoby v lékárničce
      await db.update(inventory)
        .set({ remaining_qty: activeSosMed.remaining_qty - amount })
        .where(eq(inventory.inventory_id, activeSosMed.inventory_id));

      setShowAmountPicker(false);
      setActiveSosMed(null);
      loadData(); 
    } catch (e) {
      Alert.alert('Chyba', 'Nepodařilo se uložit záznam.');
    }
  };

  const handleAddOption = (route: any) => {
    setShowAddMenu(false);
    router.push(route);
  };
  
  const today = new Date();
  const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  let formattedDate = today.toLocaleDateString('cs-CZ', dateOptions);
  formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        
        {/* HLAVIČKA S DYNAMICKÝM JMÉNEM */}
        <View style={styles.headerContainer}>
          <View>
            <Text style={styles.greeting}>Ahoj, {userName || 'Načítám...'} 👋</Text>
            <Text style={styles.date}>{formattedDate}</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddMenu(true)} activeOpacity={0.7}>
            <MaterialCommunityIcons name="plus" size={28} color="white" />
          </TouchableOpacity>
        </View>

        {/* NADCHÁZEJÍCÍ NÁVŠTĚVY */}
        {upcomingVisits.length > 0 && (
          <View style={styles.visitsContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Blížící se návštěvy</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {upcomingVisits.map(visit => {
                const vDate = new Date(visit.date);
                const isToday = vDate.toDateString() === today.toDateString();
                return (
                  <TouchableOpacity 
                    key={visit.visit_id} 
                    style={[styles.visitCard, isToday && { borderColor: '#2196F3', borderWidth: 2 }]}
                    activeOpacity={0.7}
                    onPress={() => router.push({ pathname: '/visit-detail', params: { id: visit.visit_id } })}
                  >
                    <View style={[styles.visitIconBox, isToday ? {backgroundColor: '#2196F3'} : {backgroundColor: '#FFF3E0'}]}>
                      <MaterialCommunityIcons name="calendar-clock" size={24} color={isToday ? '#FFF' : '#FF9800'} />
                    </View>
                    <View>
                      <Text style={styles.visitDoctor}>{visit.doctor}</Text>
                      <Text style={[styles.visitDate, isToday && { color: '#2196F3', fontWeight: 'bold' }]}>
                        {isToday ? 'Dnes' : vDate.toLocaleDateString('cs-CZ')} v {vDate.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute: '2-digit'})}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        )}

        {/* PRAVIDELNÉ LÉKY NA DNEŠEK */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tvé dnešní léky</Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={colors.third || '#00D084'} style={{ marginTop: 20 }} />
        ) : regularMeds.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="check-circle-outline" size={40} color="#E0E0E0" />
            <Text style={styles.emptyText}>Na dnešek nemáš naplánované žádné pravidelné léky.</Text>
          </View>
        ) : (
          regularMeds.map((med) => (
            <MedicationCard 
              key={med.plan_id} 
              medicationId={med.plan_id}
              inventoryId={med.inventory_id} // <--- TOTO JSME PŘIDALI
              name={med.medication_name}
              remaining={med.remaining_qty}
              unit={med.unit}
              form={med.form}
              dosesConfig={med.doses_config}
              diseaseName={med.diseaseName}
              onUpdate={loadData}
            />
          ))
        )}

        {/* SOS LÉKY (Dle potřeby) */}
        {sosMeds.length > 0 && (
          <View style={styles.sosContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Podle potřeby (SOS)</Text>
              <Text style={styles.sectionSubtitle}>Klikni, pokud si lék zrovna bereš</Text>
            </View>

            {sosMeds.map((med) => {
              const isEmpty = med.remaining_qty <= 0;
              return (
                <View key={med.plan_id} style={[styles.sosCard, isEmpty && { borderColor: '#EEE', opacity: 0.8 }]}>
                  <View style={styles.sosInfo}>
                    <View style={[styles.iconBox, { backgroundColor: isEmpty ? '#F5F5F5' : '#FFF5F5' }]}>
                      <MaterialCommunityIcons name={med.form === 'SYRUP' ? 'medication-outline' : 'pill-multiple'} size={28} color={isEmpty ? '#AAA' : colors.fourth} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sosName, isEmpty && {color: '#888'}]}>{med.medication_name}</Text>
                      <Text style={[styles.sosHint, { color: isEmpty ? '#AAA' : colors.third, fontWeight: '600' }]}>
                        {med.diseaseName ? `🩺 Na: ${med.diseaseName}` : '🛡️ Preventivní'}
                      </Text>
                      <Text style={styles.sosHint}>{med.interval_hint || 'Žádné doplňující instrukce'}</Text>
                      <Text style={[styles.sosRemaining, isEmpty && {color: '#FF5252'}]}>
                        {isEmpty ? '⚠️ Krabička je prázdná' : `V lékárničce zbývá: ${med.remaining_qty} ${med.unit}`}
                      </Text>
                    </View>
                  </View>
                  
                  <TouchableOpacity 
                    style={[styles.sosButton, isEmpty && { backgroundColor: '#F0F0F0' }]} 
                    onPress={() => handleTakeSosClick(med)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name={isEmpty ? "archive-outline" : "lightning-bolt"} size={20} color={isEmpty ? "#888" : "#FFF"} />
                    <Text style={[styles.sosButtonText, isEmpty && {color: '#888'}]}>
                      {isEmpty ? 'Vyřadit a změnit' : 'Vzít teď'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>

      {/* MODAL PRO MENU "PŘIDAT" */}
      <Modal visible={showAddMenu} animationType="fade" transparent>
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} 
          activeOpacity={1} 
          onPress={() => setShowAddMenu(false)}
        >
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, paddingBottom: 40 }} onStartShouldSetResponder={() => true}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center' }}>
              <Text style={{fontSize: 18, fontWeight:'bold', color: '#111'}}>Co chcete přidat?</Text>
              <TouchableOpacity onPress={() => setShowAddMenu(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.addMenuRow} onPress={() => handleAddOption('/add-disease')}>
              <View style={[styles.addMenuIcon, { backgroundColor: '#FFEBEB' }]}>
                <MaterialCommunityIcons name="thermometer" size={24} color="#FF5252" />
              </View>
              <View>
                <Text style={styles.addMenuText}>Novou diagnózu</Text>
                <Text style={styles.addMenuSub}>Zdravotní problém nebo nemoc</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addMenuRow} onPress={() => handleAddOption('/add-medication')}>
              <View style={[styles.addMenuIcon, { backgroundColor: '#E8F5E9' }]}>
                <MaterialCommunityIcons name="pill-multiple" size={24} color={colors.fourth} />
              </View>
              <View>
                <Text style={styles.addMenuText}>Novou medikaci</Text>
                <Text style={styles.addMenuSub}>Pravidelný režim nebo lék SOS</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.addMenuRow, { borderBottomWidth: 0 }]} onPress={() => handleAddOption('/add-visit')}>
              <View style={[styles.addMenuIcon, { backgroundColor: '#E3F2FD' }]}>
                <MaterialCommunityIcons name="calendar-plus" size={24} color="#2196F3" />
              </View>
              <View>
                <Text style={styles.addMenuText}>Návštěvu lékaře</Text>
                <Text style={styles.addMenuSub}>Naplánovat kontrolu nebo vyšetření</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MODAL PRO VÝBĚR MNOŽSTVÍ SOS LÉKU */}
      <Modal transparent visible={showAmountPicker} animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.amountCard}>
            <Text style={styles.amountTitle}>Kolik {activeSosMed?.unit} si bereš?</Text>
            <TextInput 
              style={styles.amountInput} 
              keyboardType="decimal-pad" 
              autoFocus 
              value={sosAmount} 
              onChangeText={setSosAmount} 
              selectTextOnFocus 
            />
            <View style={styles.amountActions}>
              <TouchableOpacity onPress={() => setShowAmountPicker(false)} style={styles.btnSec}>
                <Text style={{fontWeight: 'bold', color: '#666'}}>Zpět</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmTakeSos} style={styles.btnPrim}>
                <Text style={{color:'#FFF', fontWeight:'bold'}}>Uložit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFA' },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 120 }, 
  
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  greeting: { fontSize: 26, fontWeight: 'bold', color: '#111' },
  date: { fontSize: 16, color: colors.third || '#007A5E', marginTop: 4, fontWeight: '600', textTransform: 'capitalize' },
  addButton: { backgroundColor: colors.third || '#00D084', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: colors.third || '#00D084', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 5 },
  
  visitsContainer: { marginBottom: 10 },
  visitCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 16, width: 260, elevation: 2, shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.05, shadowRadius: 5 },
  visitIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  visitDoctor: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  visitDate: { fontSize: 13, color: '#888', marginTop: 2 },

  sectionHeader: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  sectionSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  
  emptyCard: { backgroundColor: '#FFF', marginHorizontal: 20, padding: 30, borderRadius: 16, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#E0E0E0', marginTop: 10 },
  emptyText: { textAlign: 'center', marginTop: 10, color: '#888', fontSize: 14, lineHeight: 20 },

  sosContainer: { marginTop: 10 },
  sosCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginHorizontal: 20, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3, borderWidth: 1, borderColor: '#FFEBEB' },
  sosInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconBox: { width: 50, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  sosName: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  sosHint: { fontSize: 13, color: '#666', marginTop: 2 },
  sosRemaining: { fontSize: 12, fontWeight: 'bold', color: '#AAA', marginTop: 4 },
  sosButton: { flexDirection: 'row', backgroundColor: '#FF5252', paddingVertical: 12, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 8 },
  sosButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },

  addMenuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  addMenuIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  addMenuText: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  addMenuSub: { fontSize: 13, color: '#888', marginTop: 2 },

  modalOverlayCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  amountCard: { width: 280, backgroundColor: '#FFF', borderRadius: 25, padding: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  amountTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 20, color: '#333' },
  amountInput: { width: '100%', backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, textAlign: 'center', fontSize: 24, fontWeight: 'bold', color: colors.third },
  amountActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnSec: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#EEE', alignItems: 'center' },
  btnPrim: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.third, alignItems: 'center' }
});