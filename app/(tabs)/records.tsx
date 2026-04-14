import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, TextInput, Modal, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import colors from '@/components/colors'; 
import { db } from '../../db';
import { diseases, medicationPlans, visits, medicationLogs, inventory, users } from '../../db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { useIsFocused } from '@react-navigation/native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function RecordsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused(); 

  const [activeTab, setActiveTab] = useState<'DISEASES' | 'MEDICATIONS' | 'VISITS'>('DISEASES');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC');
  const [timeFilter, setTimeFilter] = useState<'ALL' | 'THIS_YEAR' | 'LAST_30_DAYS'>('ALL');

  const [diseasesList, setDiseasesList] = useState<any[]>([]);
  const [medsList, setMedsList] = useState<any[]>([]);
  const [visitsList, setVisitsList] = useState<any[]>([]);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused]);

  const [userName, setUserName] = useState(''); 

  const loadData = async () => {
    try {
      const storedId = await SecureStore.getItemAsync('activeUserId');
      let currentUserId = storedId ? Number(storedId) : null;

      if (!currentUserId) {
        const allUsers = await db.select().from(users);
        if (allUsers.length > 0) currentUserId = allUsers[0].user_id;
        else return;
      }

      // NAČTENÍ JMÉNA
      const currentUserData = await db.select().from(users).where(eq(users.user_id, currentUserId));
      if (currentUserData.length > 0) setUserName(currentUserData[0].name);

      // Filtry pro konkrétního uživatele
      const d = await db.select().from(diseases).where(eq(diseases.user_id, currentUserId)).orderBy(desc(diseases.start_date));
      const v = await db.select().from(visits).where(eq(visits.user_id, currentUserId)).orderBy(desc(visits.date));
      
      const m = await db
        .select({
          plan_id: medicationPlans.plan_id,
          medication_name: inventory.medication_name,
          form: inventory.form,
          unit: inventory.unit,
          is_sos: medicationPlans.is_sos,
          start_date: medicationPlans.start_date,
          end_date: medicationPlans.end_date,
          doses_config: medicationPlans.doses_config,
          disease_name: diseases.disease_name,
        })
        .from(medicationPlans)
        .innerJoin(inventory, eq(medicationPlans.inventory_id, inventory.inventory_id))
        .leftJoin(diseases, eq(medicationPlans.disease_id, diseases.disease_id))
        .where(eq(medicationPlans.user_id, currentUserId))
        .orderBy(desc(medicationPlans.plan_id));
      
      setDiseasesList(d);
      setMedsList(m);
      setVisitsList(v);
    } catch (e) {
      console.error("Chyba při načítání dat:", e);
    }
  };

  const handleAdd = () => {
    if (activeTab === 'DISEASES') router.push('/add-disease');
    if (activeTab === 'MEDICATIONS') router.push('/add-medication');
    if (activeTab === 'VISITS') router.push('/add-visit');
  };

  const handleDelete = (type: string, id: number) => {
    Alert.alert(
      "Smazat záznam",
      "Opravdu chcete tento záznam smazat?",
      [
        { text: "Zrušit", style: "cancel" },
        { 
          text: "Smazat", 
          style: "destructive", 
          onPress: async () => {
            try {
              if (type === 'DISEASES') {
                const plans = await db.select({ plan_id: medicationPlans.plan_id }).from(medicationPlans).where(eq(medicationPlans.disease_id, id));
                const planIds = plans.map(p => p.plan_id);
                if (planIds.length > 0) await db.delete(medicationLogs).where(inArray(medicationLogs.plan_id, planIds));
                await db.delete(medicationPlans).where(eq(medicationPlans.disease_id, id));
                await db.delete(visits).where(eq(visits.disease_id, id));
                await db.delete(diseases).where(eq(diseases.disease_id, id));
              } 
              else if (type === 'MEDICATIONS') {
                await db.delete(medicationLogs).where(eq(medicationLogs.plan_id, id));
                await db.delete(medicationPlans).where(eq(medicationPlans.plan_id, id));
              } 
              else if (type === 'VISITS') {
                await db.delete(visits).where(eq(visits.visit_id, id));
              }
              loadData(); 
            } catch (e) {}
          }
        }
      ]
    );
  };

  const generatePdfReport = async () => {
    try {
      const activeDiseases = diseasesList.filter(d => d.end_date === null);
      const historyDiseases = diseasesList.filter(d => d.end_date !== null); // <--- Přidáno
      const activeMeds = medsList.filter(m => m.end_date === null);
      const plannedVisits = visitsList.filter(v => v.status !== 'COMPLETED');

      const formatDoses = (configString: string, unit: string) => {
        try {
          const parsed = JSON.parse(configString);
          if (!parsed || parsed.length === 0) return 'Dle instrukcí';
          return parsed.map((sched: any) => {
            const days = sched.days.length === 7 ? 'Každý den' : `Vybrané dny (${sched.days.length}x týdně)`;
            const times = sched.doses.map((d: any) => `${d.time} (${d.amount} ${unit})`).join(', ');
            return `${days}: ${times}`;
          }).join(' | ');
        } catch(e) { return 'Pravidelně'; }
      };

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="cs">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Lékařská zpráva - Přehled pacienta</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; padding: 40px; }
                h1 { color: #111; border-bottom: 2px solid #2196F3; padding-bottom: 10px; margin-bottom: 10px; }
                .patient-name { font-size: 18px; color: #555; margin-bottom: 30px; }
                h2 { color: #2196F3; margin-top: 40px; font-size: 20px; }
                .date-header { font-size: 14px; color: #666; text-align: right; margin-top: -85px; margin-bottom: 40px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #EEE; vertical-align: top;}
                th { background-color: #F8F9FA; font-weight: bold; color: #555; font-size: 14px; text-transform: uppercase; }
                .badge-sos { background-color: #FFEBEB; color: #FF5252; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
                .badge-acute { background-color: #FFF3E0; color: #FF9800; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
                .badge-chronic { background-color: #E3F2FD; color: #2196F3; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
                .empty-text { color: #888; font-style: italic; margin-top: 10px; }
                .footer { margin-top: 60px; text-align: center; font-size: 12px; color: #AAA; border-top: 1px solid #EEE; padding-top: 20px; }
            </style>
        </head>
        <body>
            <h1>Zdravotní přehled pacienta</h1>
            <div class="patient-name">Jméno pacienta: <strong>${userName || 'Neuvedeno'}</strong></div>
            <div class="date-header">Vygenerováno dne: <strong>${new Date().toLocaleDateString('cs-CZ')}</strong></div>
            
            <h2>1. Aktuální diagnózy a problémy</h2>
            ${activeDiseases.length > 0 ? `
              <table>
                  <tr><th>Diagnóza</th><th>Od kdy</th><th>Typ</th></tr>
                  ${activeDiseases.map(d => `<tr><td><strong>${d.disease_name}</strong></td><td>${new Date(d.start_date).toLocaleDateString('cs-CZ')}</td><td><span class="${d.type === 'ACUTE' ? 'badge-acute' : 'badge-chronic'}">${d.type === 'ACUTE' ? 'Akutní' : 'Chronické'}</span></td></tr>`).join('')}
              </table>
            ` : `<p class="empty-text">Žádné probíhající diagnózy.</p>`}

            <h2>2. Aktuální medikace (Režimy užívání)</h2>
            ${activeMeds.length > 0 ? `
              <table>
                  <tr><th>Lék</th><th>Dávkování</th><th>Léčí diagnózu</th></tr>
                  ${activeMeds.map(m => `<tr><td><strong>${m.medication_name}</strong></td><td>${m.is_sos ? `<span class="badge-sos">Dle potřeby (SOS)</span>` : formatDoses(m.doses_config, m.unit)}</td><td>${m.disease_name || '<i>Preventivní užívání</i>'}</td></tr>`).join('')}
              </table>
            ` : `<p class="empty-text">Pacient momentálně neužívá žádné léky.</p>`}
            
            <h2>3. Prodělané diagnózy (Historie)</h2>
            ${historyDiseases.length > 0 ? `
              <table>
                  <tr><th>Diagnóza</th><th>Období</th><th>Typ</th></tr>
                  ${historyDiseases.map(d => `<tr><td style="color:#666;"><strong>${d.disease_name}</strong></td><td style="color:#666;">${new Date(d.start_date).toLocaleDateString('cs-CZ')} - ${new Date(d.end_date).toLocaleDateString('cs-CZ')}</td><td><span style="color:#888; font-size:12px; text-transform:uppercase; font-weight:bold;">Ukončeno</span></td></tr>`).join('')}
              </table>
            ` : `<p class="empty-text">Žádná historie diagnóz.</p>`}

            <h2>4. Nadcházející návštěvy lékaře</h2>
            ${plannedVisits.length > 0 ? `
              <table>
                  <tr><th>Lékař / Oddělení</th><th>Datum a čas</th></tr>
                  ${plannedVisits.map(v => { const vDate = new Date(v.date); return `<tr><td><strong>${v.doctor || 'Neuvedeno'}</strong><br><span style="color:#666; font-size: 13px;">${v.department || ''} ${v.department && v.hospital ? '•' : ''} ${v.hospital || ''}</span></td><td>${vDate.toLocaleDateString('cs-CZ')} v ${vDate.toLocaleTimeString('cs-CZ', {hour: '2-digit', minute: '2-digit'})}</td></tr>`}).join('')}
              </table>
            ` : `<p class="empty-text">Žádné plánované návštěvy.</p>`}
            
            <div class="footer">Tento dokument byl automaticky vygenerován z osobní zdravotní aplikace eZdraví.</div>
        </body>
        </html>
      `;
      // Generování dynamického obsahu a konverze do PDF
      const { uri } = await Print.printToFileAsync({ 
        html: htmlContent, 
        base64: false 
      });
      await Sharing.shareAsync(uri, { 
        mimeType: 'application/pdf', 
        dialogTitle: 'Sdílet lékařský report', 
        UTI: 'com.adobe.pdf' 
      });
    } catch (error) {}
  };

  const renderRightActions = (type: string, id: number) => {
    return (
      <TouchableOpacity style={styles.deleteAction} activeOpacity={0.8} onPress={() => handleDelete(type, id)}>
        <MaterialCommunityIcons name="trash-can-outline" size={28} color="#FFF" />
        <Text style={styles.deleteActionText}>Smazat</Text>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    if (activeTab === 'DISEASES') {
      return (
        <Swipeable renderRightActions={() => renderRightActions('DISEASES', item.disease_id)}>
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push({ pathname: '/disease-detail', params: { id: item.disease_id } })}>
            <View style={[styles.iconBox, { backgroundColor: item.end_date ? '#F5F5F5' : '#FFEBEB' }]}><MaterialCommunityIcons name="thermometer" size={28} color={item.end_date ? '#AAA' : '#FF5252'} /></View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, item.end_date && { color: '#666' }]}>{item.disease_name}</Text>
              <Text style={styles.cardSub}>{new Date(item.start_date).toLocaleDateString('cs-CZ')} {item.end_date ? ` - ${new Date(item.end_date).toLocaleDateString('cs-CZ')}` : ' • Stále probíhá'} {` • ${item.type === 'ACUTE' ? 'Akutní' : 'Chronické'}`}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#CCC" />
          </TouchableOpacity>
        </Swipeable>
      );
    }
    if (activeTab === 'MEDICATIONS') {
      const isEnded = item.end_date !== null; 
      return (
        <Swipeable renderRightActions={() => renderRightActions('MEDICATIONS', item.plan_id)}>
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push({ pathname: '/medication-detail', params: { id: item.plan_id } })}>
            <View style={[styles.iconBox, { backgroundColor: isEnded ? '#F5F5F5' : '#E8F5E9' }]}><MaterialCommunityIcons name={item.form === 'SYRUP' ? 'medication-outline' : 'pill-multiple'} size={28} color={isEnded ? '#AAA' : (colors.fourth || '#4CAF50')} /></View>
            <View style={styles.cardText}>
              <Text style={[styles.cardTitle, isEnded && { color: '#666' }]}>{item.medication_name}</Text>
              <Text style={[{ fontSize: 13, color: colors.third, fontWeight: '600', marginTop: 2 }, isEnded && { color: '#888' }]}>{item.disease_name ? `🩺 Na: ${item.disease_name}` : '🛡️ Preventivní'}</Text>
              <Text style={styles.cardSub}>{new Date(item.start_date).toLocaleDateString('cs-CZ')} {isEnded ? `- ${new Date(item.end_date).toLocaleDateString('cs-CZ')}` : '- doteď'} • {item.is_sos ? 'SOS' : 'Pravidelně'}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#CCC" />
          </TouchableOpacity>
        </Swipeable>
      );
    }
    if (activeTab === 'VISITS') {
      return (
        <Swipeable renderRightActions={() => renderRightActions('VISITS', item.visit_id)}>
          <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => router.push({ pathname: '/visit-detail', params: { id: item.visit_id } })}>
            <View style={[styles.iconBox, { backgroundColor: item.status === 'COMPLETED' ? '#E3F2FD' : '#FFF3E0' }]}><MaterialCommunityIcons name={item.status === 'COMPLETED' ? 'calendar-check' : 'calendar-clock'} size={28} color={item.status === 'COMPLETED' ? '#2196F3' : '#FF9800'} /></View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{item.doctor}</Text>
              <Text style={styles.cardSub}>{item.department || 'Neuvedené oddělení'} • {new Date(item.date).toLocaleDateString('cs-CZ')}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#CCC" />
          </TouchableOpacity>
        </Swipeable>
      );
    }
    return null;
  };

  let currentData: any[] = [];
  if (activeTab === 'DISEASES') {
    currentData = diseasesList.filter(d => statusFilter === 'ACTIVE' ? d.end_date === null : d.end_date !== null);
    if (searchQuery) currentData = currentData.filter(d => d.disease_name.toLowerCase().includes(searchQuery.toLowerCase()));
  } else if (activeTab === 'MEDICATIONS') {
    currentData = medsList.filter(m => statusFilter === 'ACTIVE' ? m.end_date === null : m.end_date !== null);
    if (searchQuery) currentData = currentData.filter(m => m.medication_name.toLowerCase().includes(searchQuery.toLowerCase()));
  } else if (activeTab === 'VISITS') {
    currentData = visitsList;
    if (searchQuery) currentData = currentData.filter(v => v.doctor && v.doctor.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  if (timeFilter !== 'ALL' && activeTab !== 'MEDICATIONS') {
    const now = new Date();
    const currentYear = now.getFullYear();
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(now.getDate() - 30);
    currentData = currentData.filter(item => {
      const itemDate = new Date(activeTab === 'DISEASES' ? item.start_date : item.date);
      if (timeFilter === 'THIS_YEAR') return itemDate.getFullYear() === currentYear;
      if (timeFilter === 'LAST_30_DAYS') return itemDate >= thirtyDaysAgo;
      return true;
    });
  }

  currentData.sort((a, b) => {
    let valA, valB;
    if (activeTab === 'DISEASES') { valA = new Date(a.start_date).getTime(); valB = new Date(b.start_date).getTime(); }
    else if (activeTab === 'VISITS') { valA = new Date(a.date).getTime(); valB = new Date(b.date).getTime(); }
    else { valA = new Date(a.start_date).getTime(); valB = new Date(b.start_date).getTime(); } // Řadíme už správně podle data!
    return sortOrder === 'DESC' ? valB - valA : valA - valB;
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Kartotéka</Text>
          <TouchableOpacity onPress={generatePdfReport} style={styles.pdfButton}>
            <MaterialCommunityIcons name="file-pdf-box" size={26} color={colors.third} />
            <Text style={styles.pdfButtonText}>Export</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={24} color="#AAA" />
          <TextInput style={styles.searchInput} placeholder="Hledat záznam..." value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 5 }}><MaterialCommunityIcons name="close-circle" size={20} color="#CCC" /></TouchableOpacity>}
          <View style={{ width: 1, height: 24, backgroundColor: '#DDD', marginHorizontal: 10 }} />
          <TouchableOpacity onPress={() => setShowFilterModal(true)} style={{ padding: 5 }}><MaterialCommunityIcons name={sortOrder === 'ASC' || timeFilter !== 'ALL' ? "filter-check" : "filter-variant"} size={24} color={colors.third} /></TouchableOpacity>
        </View>

        <View style={styles.topTabs}>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'DISEASES' && styles.tabActive]} onPress={() => setActiveTab('DISEASES')}><Text style={[styles.tabText, activeTab === 'DISEASES' && styles.tabTextActive]}>Diagnózy</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'MEDICATIONS' && styles.tabActive]} onPress={() => setActiveTab('MEDICATIONS')}><Text style={[styles.tabText, activeTab === 'MEDICATIONS' && styles.tabTextActive]}>Medikace</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'VISITS' && styles.tabActive]} onPress={() => setActiveTab('VISITS')}><Text style={[styles.tabText, activeTab === 'VISITS' && styles.tabTextActive]}>Návštěvy</Text></TouchableOpacity>
        </View>

        {(activeTab === 'DISEASES' || activeTab === 'MEDICATIONS') && (
          <View style={styles.subTabsContainer}>
            <TouchableOpacity style={[styles.subTabBtn, statusFilter === 'ACTIVE' && styles.subTabActive]} onPress={() => setStatusFilter('ACTIVE')}><Text style={[styles.subTabText, statusFilter === 'ACTIVE' && styles.subTabTextActive]}>Aktuální</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.subTabBtn, statusFilter === 'HISTORY' && styles.subTabActive]} onPress={() => setStatusFilter('HISTORY')}><Text style={[styles.subTabText, statusFilter === 'HISTORY' && styles.subTabTextActive]}>Historie</Text></TouchableOpacity>
          </View>
        )}

        <FlatList
          data={currentData}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name={(activeTab === 'DISEASES' || activeTab === 'MEDICATIONS') && statusFilter === 'HISTORY' ? "archive-outline" : "folder-open-outline"} size={48} color="#CCC" />
              <Text style={styles.emptyText}>Zatím tu nejsou žádné záznamy.</Text>
            </View>
          }
        />

        <TouchableOpacity style={styles.fab} onPress={handleAdd} activeOpacity={0.8}><MaterialCommunityIcons name="plus" size={32} color="#FFF" /></TouchableOpacity>

        <Modal visible={showFilterModal} animationType="fade" transparent>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
            <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#EEE', alignItems: 'center' }}><Text style={{ fontSize: 18, fontWeight:'bold', color: '#111' }}>Filtry a řazení</Text><TouchableOpacity onPress={() => setShowFilterModal(false)}><MaterialCommunityIcons name="close" size={24} color="#333" /></TouchableOpacity></View>
              <ScrollView style={{ padding: 20 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#AAA', letterSpacing: 1, marginBottom: 15 }}>ŘADIT PODLE</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 30 }}>
                  <TouchableOpacity style={[styles.filterBtn, sortOrder === 'DESC' && styles.filterBtnActive]} onPress={() => setSortOrder('DESC')}><Text style={[styles.filterBtnText, sortOrder === 'DESC' && styles.filterBtnTextActive]}>Nejnovější</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.filterBtn, sortOrder === 'ASC' && styles.filterBtnActive]} onPress={() => setSortOrder('ASC')}><Text style={[styles.filterBtnText, sortOrder === 'ASC' && styles.filterBtnTextActive]}>Nejstarší</Text></TouchableOpacity>
                </View>
                {activeTab !== 'MEDICATIONS' && (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#AAA', letterSpacing: 1, marginBottom: 15 }}>ČASOVÉ OBDOBÍ</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                      <TouchableOpacity style={[styles.filterBtn, timeFilter === 'ALL' && styles.filterBtnActive]} onPress={() => setTimeFilter('ALL')}><Text style={[styles.filterBtnText, timeFilter === 'ALL' && styles.filterBtnTextActive]}>Vše</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.filterBtn, timeFilter === 'THIS_YEAR' && styles.filterBtnActive]} onPress={() => setTimeFilter('THIS_YEAR')}><Text style={[styles.filterBtnText, timeFilter === 'THIS_YEAR' && styles.filterBtnTextActive]}>Letošní rok</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.filterBtn, timeFilter === 'LAST_30_DAYS' && styles.filterBtnActive]} onPress={() => setTimeFilter('LAST_30_DAYS')}><Text style={[styles.filterBtnText, timeFilter === 'LAST_30_DAYS' && styles.filterBtnTextActive]}>Posledních 30 dní</Text></TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFA' }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 }, title: { fontSize: 32, fontWeight: 'bold', color: '#111' }, pdfButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 6 }, pdfButtonText: { color: colors.third, fontWeight: 'bold', fontSize: 14 }, searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEE', marginHorizontal: 20, marginBottom: 15, paddingHorizontal: 15, borderRadius: 16, height: 50 }, searchInput: { flex: 1, marginLeft: 10, fontSize: 16, color: '#333' }, topTabs: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 15 }, tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 20, backgroundColor: '#EEE' }, tabActive: { backgroundColor: colors.third }, tabText: { fontWeight: 'bold', color: '#888' }, tabTextActive: { color: '#FFF' }, subTabsContainer: { flexDirection: 'row', backgroundColor: '#EFEFEF', borderRadius: 12, padding: 4, marginHorizontal: 20, marginBottom: 10 }, subTabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 }, subTabActive: { backgroundColor: '#FFF', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 }, subTabText: { color: '#888', fontWeight: 'bold', fontSize: 13 }, subTabTextActive: { color: '#333' }, card: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5 }, iconBox: { width: 50, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 }, cardText: { flex: 1, justifyContent: 'center' }, cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' }, cardSub: { fontSize: 13, color: '#888', marginTop: 4 }, deleteAction: { backgroundColor: '#FF5252', justifyContent: 'center', alignItems: 'center', width: 90, borderRadius: 16, marginBottom: 12, marginLeft: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 5 }, deleteActionText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginTop: 4 }, emptyState: { alignItems: 'center', marginTop: 50 }, emptyText: { color: '#AAA', marginTop: 10 }, fab: { position: 'absolute', right: 20, bottom: 100, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.third, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 }, filterBtn: { paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#F5F5F5', borderRadius: 20, borderWidth: 1, borderColor: '#EEE' }, filterBtnActive: { backgroundColor: '#E8F5E9', borderColor: colors.third }, filterBtnText: { color: '#666', fontWeight: '600' }, filterBtnTextActive: { color: colors.third, fontWeight: 'bold' }
});