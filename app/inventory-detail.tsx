import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import colors from '@/components/colors';
import { db } from '../db';
import { inventory, visits, medicationPlans, diseases, medicationLogs } from '../db/schema';
import { eq, inArray, desc } from 'drizzle-orm';

export default function InventoryDetailScreen() {
  const router = useRouter();
  const { id, from_disease_id, from_plan_id, from_visit_id } = useLocalSearchParams();
  const inventoryId = Number(id);
  const fromDiseaseId = from_disease_id ? Number(from_disease_id) : null;
  const fromPlanId = from_plan_id ? Number(from_plan_id) : null;
  const fromVisitId = from_visit_id ? Number(from_visit_id) : null;

  const hasFromPlan = !!from_plan_id && from_plan_id !== '';

  const historyParams = {
    from_inventory_id: inventoryId,
    from_disease_id: fromDiseaseId || '',
    from_plan_id: fromPlanId || '',
    from_visit_id: fromVisitId || '',
  };

  const [item, setItem] = useState<any>(null);
  const [sourceVisit, setSourceVisit] = useState<any>(null);
  const [activePlans, setActivePlans] = useState<any[]>([]);
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [allVisits, setAllVisits] = useState<any[]>([]);

  const openVisitModal = async () => {
    try {
      const visitsData = await db.select().from(visits).orderBy(desc(visits.date));
      setAllVisits(visitsData);
      setShowVisitModal(true);
    } catch (e) {}
  };

  // Upraveno pro možnost "Nevybráno (null)"
  const handleLinkVisit = async (targetVisitId: number | null) => {
    try {
      await db.update(inventory).set({ visit_id: targetVisitId }).where(eq(inventory.inventory_id, inventoryId));
      setShowVisitModal(false);
      loadInventoryDetails();
    } catch (e) { Alert.alert('Chyba', 'Nepodařilo se propojit.'); }
  };

  const handleUnlinkVisit = () => {
    Alert.alert("Zrušit vazbu", "Opravdu chcete odebrat vazbu na tuto návštěvu?", [
      { text: "Zrušit", style: "cancel" },
      { text: "Odebrat", style: "destructive", onPress: async () => {
          await handleLinkVisit(null);
      }}
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      if (inventoryId) loadInventoryDetails();
    }, [inventoryId])
  );

  const loadInventoryDetails = async () => {
    try {
      const invData = await db.select().from(inventory).where(eq(inventory.inventory_id, inventoryId));
      if (invData.length === 0) return;
      const currentItem = invData[0];
      setItem(currentItem);

      if (currentItem.visit_id) {
        const visitData = await db.select().from(visits).where(eq(visits.visit_id, currentItem.visit_id));
        if (visitData.length > 0) setSourceVisit(visitData[0]);
      } else {
        setSourceVisit(null);
      }

      const plansData = await db
        .select({
          plan_id: medicationPlans.plan_id,
          is_sos: medicationPlans.is_sos,
          start_date: medicationPlans.start_date,
          end_date: medicationPlans.end_date, 
          disease_name: diseases.disease_name,
        })
        .from(medicationPlans)
        .leftJoin(diseases, eq(medicationPlans.disease_id, diseases.disease_id))
        .where(eq(medicationPlans.inventory_id, inventoryId));
        
      let logsData: any[] = [];
      try {
        logsData = await db.select().from(medicationLogs).where(eq(medicationLogs.inventory_id, inventoryId));
      } catch(e) {
        console.log("Sloupec inventory_id ještě chybí.");
      }

      let plansWithUsage = plansData.map(plan => {
        const usedAmount = logsData
          .filter(log => log.plan_id === plan.plan_id)
          .reduce((sum, log) => sum + (log.amount || 0), 0);
        return { ...plan, usedAmount };
      });

      plansWithUsage.sort((a, b) => {
        const aIsActive = a.end_date === null;
        const bIsActive = b.end_date === null;
        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;
        return b.plan_id - a.plan_id; 
      });

      setActivePlans(plansWithUsage);

    } catch (e) {
      console.error("Chyba při načítání detailu krabičky:", e);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Smazat krabičku úplně",
      "Opravdu chceš tuto krabičku smazat z databáze?",
      [
        { text: "Zrušit", style: "cancel" },
        { 
          text: "Smazat vše", 
          style: "destructive", 
          onPress: async () => {
            try {
              const plans = await db.select({ plan_id: medicationPlans.plan_id }).from(medicationPlans).where(eq(medicationPlans.inventory_id, inventoryId));
              const planIds = plans.map(p => p.plan_id);

              if (planIds.length > 0) {
                await db.delete(medicationLogs).where(inArray(medicationLogs.plan_id, planIds));
                await db.delete(medicationPlans).where(inArray(medicationPlans.plan_id, planIds));
              }

              await db.delete(inventory).where(eq(inventory.inventory_id, inventoryId));
              router.back();
            } catch (e) {}
          }
        }
      ]
    );
  };

  const handleArchive = () => {
    Alert.alert(
      "Vyřadit krabičku",
      "Přesunout krabičku natrvalo do historie?",
      [
        { text: "Zrušit", style: "cancel" },
        { 
          text: "Vyřadit do historie", 
          style: "default", 
          onPress: async () => {
            try {
              const today = new Date().toISOString();
              await db.update(inventory).set({ status: 'DEPLETED', depleted_at: today }).where(eq(inventory.inventory_id, inventoryId));
              loadInventoryDetails();
            } catch (e) {}
          }
        }
      ]
    );
  };

  if (!item) return <SafeAreaView style={styles.safeArea}><Text style={{ textAlign: 'center', marginTop: 50 }}>Načítám...</Text></SafeAreaView>;

  const isArchived = item.status === 'DEPLETED';

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ zIndex: 10 }}>
          <MaterialCommunityIcons name="arrow-left" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: 1 }]}>Detail Krabičky</Text>
        <View style={{ flexDirection: 'row', gap: 15, zIndex: 10 }}>
          {!isArchived && (
            <TouchableOpacity onPress={() => router.push({ pathname: '/add-inventory', params: { id: inventoryId } })}>
                <MaterialCommunityIcons name="pencil-outline" size={26} color="#2196F3" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleDelete}>
              <MaterialCommunityIcons name="trash-can-outline" size={26} color="#FF5252" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.mainCard}>
          <View style={styles.titleRow}>
            <View style={[styles.iconBox, { backgroundColor: isArchived ? '#F5F5F5' : '#E8F5E9' }]}>
              <MaterialCommunityIcons name={item.form === 'SYRUP' ? 'medication-outline' : 'pill'} size={32} color={isArchived ? '#AAA' : colors.third} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.medName, isArchived && { color: '#888' }]}>{item.medication_name}</Text>
              <Text style={styles.statusBadge}>
                {item.form === 'SYRUP' ? 'Kapky / Sirup' : 'Prášky'}
                {isArchived ? ' • Vyřazeno' : ''}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          
          <View style={styles.infoRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.label}>ZBYLÉ MNOŽSTVÍ</Text>
              <Text style={[styles.value, { color: isArchived ? '#888' : colors.third }]}>{item.remaining_qty} z {item.total_qty} {item.unit}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>EXPIRACE</Text>
              <Text style={[styles.value, isArchived && { color: '#888' }]}>{item.expiration_date ? new Date(item.expiration_date).toLocaleDateString('cs-CZ') : 'Neuvedeno'}</Text>
            </View>
          </View>

          <View style={{ marginTop: 20 }}>
            <Text style={styles.label}>PŘIDÁNO DO LÉKÁRNIČKY</Text>
            <Text style={[styles.value, { fontSize: 16, color: isArchived ? '#888' : '#555' }]}>
              {item.created_at ? new Date(item.created_at).toLocaleDateString('cs-CZ') : 'Neznámé'}
            </Text>
          </View>

          {isArchived && item.depleted_at && (
            <View style={{ marginTop: 20 }}>
              <Text style={styles.label}>VYŘAZENO / DOBRÁNO</Text>
              <Text style={[styles.value, { fontSize: 16, color: '#888' }]}>
                {new Date(item.depleted_at).toLocaleDateString('cs-CZ')}
              </Text>
            </View>
          )}

          {!isArchived && (
            <View style={{ marginTop: 25 }}>
              <TouchableOpacity onPress={handleArchive} style={{ backgroundColor: '#FFF5F5', padding: 15, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#FFCDD2' }}>
                <MaterialCommunityIcons name="archive-outline" size={20} color="#FF5252" />
                <Text style={{ color: '#FF5252', fontWeight: 'bold', fontSize: 15 }}>Vyřadit do historie</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ---> RYCHLÉ AKCE <--- */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 25, marginTop: -5 }}>
          {!sourceVisit && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#F4F9FF', borderColor: '#2196F3' }]} onPress={openVisitModal} activeOpacity={0.7}>
              <MaterialCommunityIcons name="stethoscope" size={20} color="#2196F3" />
              <Text style={[styles.actionBtnText, { color: '#2196F3' }]}>Návštěva</Text>
            </TouchableOpacity>
          )}
          {!isArchived && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#F4FBF5', borderColor: colors.fourth }]} onPress={() => router.push({ pathname: '/add-medication', params: { preselected_inventory_id: inventoryId } })} activeOpacity={0.7}>
              <MaterialCommunityIcons name="pill" size={20} color={colors.fourth} />
              <Text style={[styles.actionBtnText, { color: colors.fourth }]}>Do režimu</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* --- ZDROJ / NÁVŠTĚVA --- */}
        <View style={{ marginBottom: 25 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#AAA', marginBottom: 10, letterSpacing: 1 }}>ZDROJ / NÁVŠTĚVA</Text>
          {sourceVisit ? (
            (() => {
              const isVisitCompleted = sourceVisit.status === 'COMPLETED';
              return (
                <TouchableOpacity 
                  style={styles.connectionCard} activeOpacity={0.7}
                  disabled={sourceVisit.visit_id == fromVisitId}
                  onPress={() => router.push({ pathname: '/visit-detail', params: { id: sourceVisit.visit_id, ...historyParams } })}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isVisitCompleted ? '#F5F5F5' : '#E3F2FD', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name={isVisitCompleted ? "calendar-check" : "stethoscope"} size={22} color={isVisitCompleted ? '#AAA' : '#2196F3'} />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: isVisitCompleted ? '#888' : '#333' }}>{sourceVisit.doctor}</Text>
                    <Text style={{ fontSize: 13, color: '#666' }}>{sourceVisit.visit_id === fromVisitId ? 'Aktuálně zobrazeno' : new Date(sourceVisit.date).toLocaleDateString('cs-CZ')}</Text>
                  </View>
                  {sourceVisit.visit_id !== fromVisitId && (
                    <TouchableOpacity style={{ padding: 10, marginRight: -10 }} onPress={(e) => { e.stopPropagation(); handleUnlinkVisit(); }}>
                      <MaterialCommunityIcons name="dots-vertical" size={24} color="#888" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })()
          ) : (
            <Text style={styles.emptyText}>Žádná zdrojová návštěva (z vlastní zásoby).</Text>
          )}
        </View>

        {/* --- VYUŽITÍ V REŽIMECH --- */}
        <View style={{ marginBottom: 40 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#AAA', marginBottom: 10, letterSpacing: 1 }}>VYUŽITÍ V REŽIMECH</Text>
          
          {activePlans.length === 0 && !isArchived && <Text style={styles.emptyText}>Zatím nevyužito v žádném léčebném režimu.</Text>}

          {activePlans.length > 0 ? (
            activePlans.map((plan, idx) => {
              const isFromPlan = plan.plan_id === fromPlanId;
              const isPlanEnded = plan.end_date !== null; 

              return (
                <TouchableOpacity 
                  key={idx}
                  style={[
                    styles.connectionCard, 
                    isFromPlan && { borderColor: colors.third, borderWidth: 2, backgroundColor: '#F0FDF4', elevation: 2 }
                  ]} 
                  activeOpacity={isFromPlan ? 1 : 0.7} 
                  disabled={isFromPlan}
                  onPress={() => router.push({ pathname: '/medication-detail', params: { id: plan.plan_id, ...historyParams } })}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isPlanEnded && !isFromPlan ? '#F5F5F5' : '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="pill-multiple" size={22} color={isPlanEnded && !isFromPlan ? '#AAA' : colors.fourth} />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    
                    {isFromPlan && (
                      <View style={{ backgroundColor: '#E8F5E9', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 6 }}>
                        <Text style={{fontSize: 10, fontWeight: 'bold', color: colors.third, textTransform: 'uppercase', letterSpacing: 0.5}}>
                          📍 Aktuální režim
                        </Text>
                      </View>
                    )}
                    
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: isPlanEnded && !isFromPlan ? '#888' : '#333' }}>
                      {plan.disease_name ? plan.disease_name : 'Preventivní užívání'}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#666' }}>
                      {new Date(plan.start_date).toLocaleDateString('cs-CZ')} {isPlanEnded ? `- ${new Date(plan.end_date).toLocaleDateString('cs-CZ')}` : 'až doteď'}
                    </Text>
                    <Text style={{fontSize: 13, fontWeight: 'bold', color: '#888', marginTop: 2}}>
                      Spotřebováno: {plan.usedAmount} {item.unit}
                    </Text>
                  </View>
                  {!isFromPlan && <MaterialCommunityIcons name="chevron-right" size={20} color="#CCC" />}
                </TouchableOpacity>
              )
            })
          ) : (
            isArchived && (
              <View style={styles.connectionCard}>
                 <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="sleep" size={22} color="#AAA" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#666' }}>Nebylo využito</Text>
                  <Text style={{ fontSize: 13, color: '#888' }}>Krabička byla vyřazena bez využití v režimu</Text>
                </View>
              </View>
            )
          )}
        </View>
      </ScrollView>

      {/* --- MODAL PRO VÝBĚR NÁVŠTĚVY --- */}
      {showVisitModal && (
        <Modal visible={true} animationType="fade" transparent onRequestClose={() => setShowVisitModal(false)}>
          <TouchableOpacity style={styles.calOverlay} activeOpacity={1} onPress={() => setShowVisitModal(false)}>
            <View style={styles.calContainer} onStartShouldSetResponder={() => true}>
              <View style={styles.calHeader}>
                <Text style={styles.calTitle}>Vybrat návštěvu</Text>
                <TouchableOpacity onPress={() => setShowVisitModal(false)}><MaterialCommunityIcons name="close" size={24} color="#333" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400, padding: 20 }}>
                
                {/* 2. VYTVOŘIT NOVOU */}
                <TouchableOpacity
                  style={[styles.connectionCard, { backgroundColor: '#F4F9FF', borderColor: '#2196F3' }]}
                  onPress={() => { setShowVisitModal(false); router.push('/add-visit'); }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="plus" size={24} color="#2196F3" />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2196F3' }}>Zapsat novou návštěvu</Text>
                  </View>
                </TouchableOpacity>
                
                {/* 1. NEVYBRÁNO */}
                <TouchableOpacity style={styles.connectionCard} onPress={() => handleLinkVisit(null)}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="shield-check-outline" size={20} color="#AAA" />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#666' }}>Vlastní zásoba (Nepropojovat)</Text>
                    <Text style={{ fontSize: 13, color: '#888' }}>Bez vazby na konkrétní návštěvu</Text>
                  </View>
                </TouchableOpacity>


                {/* 3. SEZNAM EXISTUJÍCÍCH */}
                {allVisits.length === 0 && <Text style={{ color: '#888', textAlign: 'center', marginTop: 10 }}>Zatím nemáte žádné návštěvy.</Text>}
                {allVisits.map((v) => (
                  <TouchableOpacity key={v.visit_id} style={styles.connectionCard} onPress={() => handleLinkVisit(v.visit_id)}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: v.status === 'COMPLETED' ? '#F5F5F5' : '#E3F2FD', justifyContent: 'center', alignItems: 'center' }}>
                      <MaterialCommunityIcons name={v.status === 'COMPLETED' ? "calendar-check" : "calendar-clock"} size={20} color={v.status === 'COMPLETED' ? '#AAA' : '#2196F3'} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: v.status === 'COMPLETED' ? '#888' : '#333' }}>{v.doctor || 'Lékař'}</Text>
                      <Text style={{ fontSize: 13, color: '#888' }}>{new Date(v.date).toLocaleDateString('cs-CZ')} • {v.status === 'COMPLETED' ? 'Proběhla' : 'Plánována'}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20 },
  mainCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, marginBottom: 15 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 60, height: 60, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  medName: { fontSize: 22, fontWeight: 'bold', color: '#111' },
  statusBadge: { fontSize: 14, color: '#888', marginTop: 4, fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 20 },
  infoRow: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 11, fontWeight: '800', color: '#AAA', letterSpacing: 1, marginBottom: 6 },
  value: { fontSize: 18, fontWeight: '700', color: '#333' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', marginLeft: 5, marginBottom: 15 },
  connectionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EEE', marginBottom: 10 },
  calOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  calContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  calTitle: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 6 },
  actionBtnText: { fontWeight: 'bold', fontSize: 14 },
  emptyText: { color: '#AAA', fontStyle: 'italic', marginBottom: 15, marginLeft: 5 },
});