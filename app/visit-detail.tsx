import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Image } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import colors from '@/components/colors';
import { db } from '../db';
import { visits, diseases, inventory, visitDocuments } from '../db/schema'; 
import { eq } from 'drizzle-orm';
import { useIsFocused } from '@react-navigation/native';

export default function VisitDetailScreen() {
  const router = useRouter();
  const { id, from_disease_id, from_plan_id, from_inventory_id } = useLocalSearchParams();
  const visitId = Number(id);
  const fromDiseaseId = from_disease_id ? Number(from_disease_id) : null;
  const fromPlanId = from_plan_id ? Number(from_plan_id) : null;
  const fromInventoryId = from_inventory_id ? Number(from_inventory_id) : null;

  const historyParams = {
    from_visit_id: visitId,
    from_disease_id: fromDiseaseId || '',
    from_plan_id: fromPlanId || '',
    from_inventory_id: fromInventoryId || '',
  };
  const isFocused = useIsFocused();

  const [visit, setVisit] = useState<any>(null);
  const [linkedDisease, setLinkedDisease] = useState<any>(null);
  const [prescribedMeds, setPrescribedMeds] = useState<any[]>([]);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [availableInventory, setAvailableInventory] = useState<any[]>([]);

  const [allDiseases, setAllDiseases] = useState<any[]>([]);
  const [showDiseaseModal, setShowDiseaseModal] = useState(false);

  // --- NOVÉ STAVY PRO FOTKY LÉKAŘSKÝCH ZPRÁV ---
  const [documents, setDocuments] = useState<any[]>([]);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const openInventoryModal = async () => {
    try {
      const invData = await db.select().from(inventory).where(eq(inventory.status, 'ACTIVE'));
      setAvailableInventory(invData.filter(i => i.visit_id !== visitId));
      setShowInventoryModal(true);
    } catch (e) {}
  };

  const handleLinkInventory = async (invId: number) => {
    try {
      await db.update(inventory).set({ visit_id: visitId }).where(eq(inventory.inventory_id, invId));
      setShowInventoryModal(false);
      loadVisitDetails();
    } catch (e) { Alert.alert('Chyba', 'Nepodařilo se propojit lék.'); }
  };

  useEffect(() => {
    if (isFocused && visitId) loadVisitDetails();
  }, [isFocused, visitId]);

  const loadVisitDetails = async () => {
    try {
      // 1. Načtení návštěvy
      const visitData = await db.select().from(visits).where(eq(visits.visit_id, visitId));
      if (visitData.length > 0) {
        const currentVisit = visitData[0];
        setVisit(currentVisit);

        // 2. Načtení napojené diagnózy
        if (currentVisit.disease_id) {
          const diseaseData = await db.select().from(diseases).where(eq(diseases.disease_id, currentVisit.disease_id));
          if (diseaseData.length > 0) setLinkedDisease(diseaseData[0]);
        } else {
          setLinkedDisease(null);
        }
        const allDis = await db.select().from(diseases);
        setAllDiseases(allDis);
      }
      
      // 3. Načtení léků
      const meds = await db.select().from(inventory).where(eq(inventory.visit_id, visitId));
      setPrescribedMeds(meds);

      // 4. Načtení fotek a dokumentů z návštěvy
      const docs = await db.select().from(visitDocuments).where(eq(visitDocuments.visit_id, visitId));
      setDocuments(docs);

    } catch (e) { console.error("Chyba:", e); }
  };

  const handleDelete = () => {
    Alert.alert("Smazat návštěvu", "Opravdu chcete tento záznam smazat?", [
        { text: "Zrušit", style: "cancel" },
        { text: "Smazat", style: "destructive", onPress: async () => {
            // Před smazáním návštěvy odstraníme i záznamy o fotkách v databázi
            await db.delete(visitDocuments).where(eq(visitDocuments.visit_id, visitId));
            await db.delete(visits).where(eq(visits.visit_id, visitId));
            router.back();
        }}
    ]);
  };

  const handleUnlinkDisease = () => {
    Alert.alert("Zrušit vazbu", "Opravdu chcete odebrat vazbu na tuto diagnózu?", [
      { text: "Zrušit", style: "cancel" },
      { text: "Odebrat", style: "destructive", onPress: async () => {
          try {
            await db.update(visits).set({ disease_id: null }).where(eq(visits.visit_id, visitId));
            loadVisitDetails();
          } catch(e) {}
      }}
    ]);
  };

  const handleUnlinkInventory = (invId: number) => {
    Alert.alert("Zrušit vazbu", "Opravdu chcete odebrat tento lék z návštěvy? Lék zůstane uložený ve vaší lékárničce.", [
      { text: "Zrušit", style: "cancel" },
      { text: "Odebrat", style: "destructive", onPress: async () => {
          try {
            await db.update(inventory).set({ visit_id: null }).where(eq(inventory.inventory_id, invId));
            loadVisitDetails();
          } catch(e) {}
      }}
    ]);
  };

  if (!visit) return <SafeAreaView style={styles.safeArea}><Text style={{textAlign:'center', marginTop:50}}>Načítám...</Text></SafeAreaView>;

  const vDate = new Date(visit.date);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ zIndex: 10 }}><MaterialCommunityIcons name="arrow-left" size={28} color="#333" /></TouchableOpacity>
        <Text style={[styles.headerTitle, { position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: 1 }]}>Detail Návštěvy</Text>
        <View style={{ flexDirection: 'row', gap: 15, zIndex: 10 }}>
          <TouchableOpacity onPress={() => router.push({ pathname: '/add-visit', params: { id: visitId } })}><MaterialCommunityIcons name="pencil-outline" size={26} color="#2196F3" /></TouchableOpacity>
          <TouchableOpacity onPress={handleDelete}><MaterialCommunityIcons name="trash-can-outline" size={26} color="#FF5252" /></TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.mainCard}>
          <View style={styles.titleRow}>
            {visit.status === 'COMPLETED' ? (
              <View style={[styles.iconBox, { backgroundColor: '#E3F2FD' }]}><MaterialCommunityIcons name="calendar-check" size={32} color="#2196F3" /></View>
            ) : (
              <View style={[styles.iconBox, { backgroundColor: '#FFF3E0' }]}><MaterialCommunityIcons name="calendar-clock" size={32} color="#FF9800" /></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.doctorName}>{visit.doctor || 'Lékař neuveden'}</Text>
              
              {/* --- ZOBRAZENÍ ODDĚLENÍ A NEMOCNICE --- */}
              {(visit.department || visit.hospital) && (
                <Text style={styles.departmentText}>
                  {visit.department ? visit.department : ''}
                  {visit.department && visit.hospital ? ' • ' : ''}
                  {visit.hospital ? visit.hospital : ''}
                </Text>
              )}

              <Text style={[styles.statusBadge, { color: visit.status === 'COMPLETED' ? '#2196F3' : '#FF9800' }]}>{visit.status === 'COMPLETED' ? 'PROBĚHLA' : 'PLÁNOVÁNA'}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <View><Text style={styles.label}>DATUM</Text><Text style={styles.value}>{vDate.toLocaleDateString('cs-CZ')}</Text></View>
            <View><Text style={styles.label}>ČAS</Text><Text style={styles.value}>{vDate.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</Text></View>
          </View>
          {visit.note && (
            <View style={styles.noteSection}><Text style={styles.label}>DIAGNÓZA A POZNÁMKY</Text><Text style={styles.noteText}>{visit.note}</Text></View>
          )}

          {/* --- GALERIE LÉKAŘSKÝCH ZPRÁV (FOTEK) --- */}
          {documents.length > 0 && (
            <View style={styles.docsSection}>
              <Text style={[styles.label, { marginBottom: 10 }]}>LÉKAŘSKÉ ZPRÁVY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, paddingHorizontal: 20 }}>
                {documents.map((doc, idx) => (
                  <TouchableOpacity key={idx} onPress={() => setFullscreenImage(doc.uri)} activeOpacity={0.8}>
                    <Image source={{ uri: doc.uri }} style={styles.thumbnailImage} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

        </View>

        {/* ---> RYCHLÉ AKCE <--- */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 25, marginTop: 15 }}>
          {!linkedDisease && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FFF5F5', borderColor: '#FF5252' }]} onPress={() => setShowDiseaseModal(true)} activeOpacity={0.7}>
              <MaterialCommunityIcons name="thermometer" size={20} color="#FF5252" />
              <Text style={[styles.actionBtnText, { color: '#FF5252' }]}>Diagnóza</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#F0FDF4', borderColor: colors.third }]} onPress={openInventoryModal} activeOpacity={0.7}>
            <MaterialCommunityIcons name="pill" size={20} color={colors.third} />
            <Text style={[styles.actionBtnText, { color: colors.third }]}>Lék</Text>
          </TouchableOpacity>
        </View>

        {/* --- 1. SOUVISÍ S DIAGNÓZOU (Vztah 1:1) --- */}
        <View style={{ marginBottom: 25 }}>
          <Text style={styles.sectionLabel}>{linkedDisease && linkedDisease.end_date !== null ? 'SOUVISELO S DIAGNÓZOU' : 'SOUVISÍ S DIAGNÓZOU'}</Text>
          {linkedDisease ? (
            <TouchableOpacity 
              style={styles.connectionCard} activeOpacity={0.7} disabled={linkedDisease.disease_id == fromDiseaseId} 
              onPress={() => router.push({ pathname: '/disease-detail', params: { id: linkedDisease.disease_id, ...historyParams } })}
            >
              <View style={[styles.listIconBox, { backgroundColor: linkedDisease.end_date !== null ? '#F5F5F5' : '#FFEBEB' }]}>
                <MaterialCommunityIcons name="thermometer" size={22} color={linkedDisease.end_date !== null ? '#AAA' : '#FF5252'} />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={[styles.listTitle, linkedDisease.end_date !== null && {color: '#888'}]}>{linkedDisease.disease_name}</Text>
                <Text style={styles.listSub}>{linkedDisease.disease_id === fromDiseaseId ? 'Aktuálně zobrazeno' : (linkedDisease.end_date !== null ? 'Ukončeno' : 'Probíhá')}</Text>
              </View>
              {linkedDisease.disease_id !== fromDiseaseId && (
                <TouchableOpacity 
                  style={{ padding: 10, marginRight: -10 }} 
                  onPress={(e) => {
                    e.stopPropagation();
                    Alert.alert("Zrušit vazbu", "Opravdu chcete odebrat vazbu na tuto diagnózu?", [
                      { text: "Zpět", style: "cancel" },
                      { text: "Odebrat", style: "destructive", onPress: handleUnlinkDisease }
                    ]);
                  }}
                >
                  <MaterialCommunityIcons name="dots-vertical" size={24} color="#888" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={styles.emptyText}>Tato návštěva je zatím preventivní.</Text>
          )}
        </View>

        {/* --- 2. ZÍSKÁNO NA TÉTO NÁVŠTĚVĚ (Vztah 1:N) --- */}
        <View style={{ marginBottom: 30 }}>
          <Text style={styles.sectionLabel}>LÉKY ZÍSKANÉ Z NÁVŠTĚVY</Text>
          
          {prescribedMeds.length === 0 && <Text style={styles.emptyText}>Zatím žádné přidané léky z této návštěvy.</Text>}

          {prescribedMeds.map((med, index) => {
            const isFromThisInventory = med.inventory_id === fromInventoryId; 
            const isInvArchived = med.status === 'DEPLETED'; 
            return (
              <TouchableOpacity 
                key={index} style={styles.connectionCard} activeOpacity={0.7} disabled={isFromThisInventory} 
                onPress={() => router.push({ pathname: '/inventory-detail', params: { id: med.inventory_id, ...historyParams } })}
              >
                <View style={[styles.listIconBox, { backgroundColor: isInvArchived ? '#F5F5F5' : '#E8F5E9' }]}>
                  <MaterialCommunityIcons name={med.form === 'SYRUP' ? 'medication' : 'pill'} size={22} color={isInvArchived ? '#AAA' : colors.third} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={[styles.listTitle, isInvArchived && {color: '#888'}]}>{med.medication_name}</Text>
                  <Text style={styles.listSub}>{isFromThisInventory ? 'Aktuálně zobrazeno' : `Zbývá: ${med.remaining_qty} ${med.unit}`}</Text>
                </View>
                {!isFromThisInventory && (
                  <TouchableOpacity 
                    style={{ padding: 10, marginRight: -10 }} 
                    onPress={(e) => {
                      e.stopPropagation();
                      Alert.alert("Zrušit vazbu", "Opravdu chcete odebrat tento lék z návštěvy?", [
                        { text: "Zpět", style: "cancel" },
                        { text: "Odebrat", style: "destructive", onPress: () => handleUnlinkInventory(med.inventory_id) }
                      ]);
                    }}
                  >
                    <MaterialCommunityIcons name="dots-vertical" size={24} color="#888" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {/* --- MODÁL PRO ZOBRAZENÍ FOTKY PŘES CELOU OBRAZOVKU --- */}
      {fullscreenImage && (
        <Modal visible={true} transparent={true} animationType="fade" onRequestClose={() => setFullscreenImage(null)}>
          <View style={styles.fullscreenContainer}>
            <TouchableOpacity style={styles.closeFullscreenBtn} onPress={() => setFullscreenImage(null)}>
              <MaterialCommunityIcons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            <Image source={{ uri: fullscreenImage }} style={styles.fullscreenImage} resizeMode="contain" />
          </View>
        </Modal>
      )}

      {showInventoryModal && (
        <Modal visible={true} animationType="fade" transparent onRequestClose={() => setShowInventoryModal(false)}>
          <TouchableOpacity style={styles.calOverlay} activeOpacity={1} onPress={() => setShowInventoryModal(false)}>
            <View style={styles.calContainer} onStartShouldSetResponder={() => true}>
              <View style={styles.calHeader}>
                <Text style={styles.calTitle}>Vybrat lékárničku</Text>
                <TouchableOpacity onPress={() => setShowInventoryModal(false)}><MaterialCommunityIcons name="close" size={24} color="#333" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400, padding: 20 }}>
                <TouchableOpacity
                  style={[styles.connectionCard, { backgroundColor: '#F0FDF4', borderColor: colors.third }]}
                  onPress={() => { setShowInventoryModal(false); router.push({ pathname: '/add-inventory', params: { preselected_visit_id: visitId } }); }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="plus" size={24} color={colors.third} />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.third }}>Vytvořit novou krabičku</Text>
                  </View>
                </TouchableOpacity>

                {availableInventory.length === 0 && <Text style={{ color: '#888', textAlign: 'center', marginTop: 10, marginBottom: 20 }}>Zatím nejsou žádné další léky k dispozici.</Text>}
                {availableInventory.map((med) => (
                  <TouchableOpacity key={med.inventory_id} style={styles.connectionCard} onPress={() => handleLinkInventory(med.inventory_id)}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                      <MaterialCommunityIcons name={med.form === 'SYRUP' ? 'medication' : 'pill'} size={20} color={colors.third} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>{med.medication_name}</Text>
                      <Text style={{ fontSize: 13, color: '#888' }}>Zbývá {med.remaining_qty} {med.unit}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {showDiseaseModal && (
        <Modal visible={true} animationType="fade" transparent onRequestClose={() => setShowDiseaseModal(false)}>
          <TouchableOpacity style={styles.calOverlay} activeOpacity={1} onPress={() => setShowDiseaseModal(false)}>
            <View style={styles.calContainer} onStartShouldSetResponder={() => true}>
              <View style={styles.calHeader}>
                <Text style={styles.calTitle}>Vybrat diagnózu</Text>
                <TouchableOpacity onPress={() => setShowDiseaseModal(false)}><MaterialCommunityIcons name="close" size={24} color="#333" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400, padding: 20 }}>
              
              <TouchableOpacity
                style={[styles.connectionCard, { backgroundColor: '#FFF5F5', borderColor: '#FF5252' }]}
                onPress={() => { setShowDiseaseModal(false); router.push('/add-disease'); }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFEBEB', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="plus" size={24} color="#FF5252" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FF5252' }}>Vytvořit novou diagnózu</Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.connectionCard} 
                onPress={async () => {
                  try {
                    await db.update(visits).set({ disease_id: null }).where(eq(visits.visit_id, visitId));
                    setShowDiseaseModal(false);
                    loadVisitDetails();
                  } catch(e) {
                    Alert.alert('Chyba', 'Nepodařilo se zrušit propojení s diagnózou.');
                  }
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="shield-check-outline" size={20} color="#AAA" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#666' }}>Nevybráno (Preventivní prohlídka)</Text>
                  <Text style={{ fontSize: 13, color: '#888' }}>Bez vazby na konkrétní diagnózu</Text>
                </View>
              </TouchableOpacity>
              
              {allDiseases
                .sort((a, b) => {
                  if (!a.end_date && b.end_date) return -1;
                  if (a.end_date && !b.end_date) return 1;
                  return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
                })
                .map(disease => {
                  const isEnded = disease.end_date !== null;
                  return (
                    <TouchableOpacity key={disease.disease_id} style={styles.connectionCard} onPress={async () => {
                      try {
                        await db.update(visits).set({ disease_id: disease.disease_id }).where(eq(visits.visit_id, visitId));
                        setShowDiseaseModal(false);
                        loadVisitDetails();
                      } catch(e) {}
                    }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isEnded ? '#F5F5F5' : '#FFEBEB', justifyContent: 'center', alignItems: 'center' }}>
                        <MaterialCommunityIcons name="thermometer" size={20} color={isEnded ? '#AAA' : '#FF5252'} />
                      </View>
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: isEnded ? '#888' : '#333' }}>{disease.disease_name}</Text>
                        <Text style={{ fontSize: 13, color: '#888' }}>
                          {new Date(disease.start_date).toLocaleDateString('cs-CZ')} {isEnded ? `- ${new Date(disease.end_date).toLocaleDateString('cs-CZ')}` : 'až doteď'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
              })}
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
  mainCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 60, height: 60, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  doctorName: { fontSize: 22, fontWeight: 'bold', color: '#111' },
  departmentText: { fontSize: 14, color: '#666', marginTop: 2 },
  statusBadge: { fontSize: 12, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 20 },
  infoRow: { flexDirection: 'row', gap: 40 },
  label: { fontSize: 11, fontWeight: '800', color: '#AAA', letterSpacing: 1, marginBottom: 6 },
  value: { fontSize: 17, fontWeight: '600', color: '#333' },
  noteSection: { marginTop: 25 },
  noteText: { fontSize: 15, color: '#555', lineHeight: 22, marginTop: 5 },
  docsSection: { marginTop: 25, borderTopWidth: 1, borderTopColor: '#F5F5F5', paddingTop: 20 },
  thumbnailImage: { width: 100, height: 140, borderRadius: 12, borderWidth: 1, borderColor: '#EEE', marginRight: 15 },
  fullscreenContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  closeFullscreenBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 25 },
  fullscreenImage: { width: '100%', height: '100%' },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#AAA', letterSpacing: 1, marginBottom: 10 },
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#EEE' },
  listIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  listTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  listSub: { fontSize: 13, color: '#888', marginTop: 2 },
  calOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  calContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  calTitle: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  connectionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EEE', marginBottom: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 6, backgroundColor: '#FFF' },
  actionBtnText: { fontWeight: 'bold', fontSize: 14 },
  emptyText: { color: '#AAA', fontStyle: 'italic', marginBottom: 15, marginLeft: 5 },
});