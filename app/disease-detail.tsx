import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import colors from '@/components/colors';
import { db } from '../db';
import { diseases, medicationPlans, inventory, visits, medicationLogs,  users } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { useIsFocused } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function DiseaseDetailScreen() {
  const router = useRouter();
  const { id, from_plan_id, from_inventory_id, from_visit_id } = useLocalSearchParams(); 
  const diseaseId = Number(id);
  const fromPlanId = from_plan_id ? Number(from_plan_id) : null;
  const fromInventoryId = from_inventory_id ? Number(from_inventory_id) : null;
  const fromVisitId = from_visit_id ? Number(from_visit_id) : null;

  const historyParams = {
    from_disease_id: diseaseId,
    from_plan_id: fromPlanId || '',
    from_inventory_id: fromInventoryId || '',
    from_visit_id: fromVisitId || '',
  };
  const isFocused = useIsFocused();

  const [disease, setDisease] = useState<any>(null);
  const [relatedMeds, setRelatedMeds] = useState<any[]>([]);
  const [relatedVisits, setRelatedVisits] = useState<any[]>([]);

  // Stavy pro modaly
  const [showMedModal, setShowMedModal] = useState(false);
  const [availableMeds, setAvailableMeds] = useState<any[]>([]);
  
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [availableVisits, setAvailableVisits] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (diseaseId) loadDiseaseDetails();
    }, [diseaseId])
  );

  const [userName, setUserName] = useState(''); 

  const loadDiseaseDetails = async () => {
    try {
      // Vypsání konkrétních sloupečků místo ...diseases
      const diseaseData = await db.select({
        disease_id: diseases.disease_id,
        user_id: diseases.user_id,
        disease_name: diseases.disease_name,
        type: diseases.type,
        note: diseases.note,
        start_date: diseases.start_date,
        end_date: diseases.end_date,
        userName: users.name
      })
      .from(diseases)
      .leftJoin(users, eq(diseases.user_id, users.user_id))
      .where(eq(diseases.disease_id, diseaseId));
      
      if (diseaseData.length > 0) {
        setDisease(diseaseData[0]);
        setUserName(diseaseData[0].userName || 'Neznámý pacient');
      }

      // Načtení léků VČETNĚ DÁVKOVÁNÍ a jednotek
      const meds = await db.select({
          plan_id: medicationPlans.plan_id,
          medName: inventory.medication_name,
          form: inventory.form,
          unit: inventory.unit,
          doses_config: medicationPlans.doses_config,
          isSos: medicationPlans.is_sos,
          end_date: medicationPlans.end_date 
        })
        .from(medicationPlans)
        .innerJoin(inventory, eq(medicationPlans.inventory_id, inventory.inventory_id))
        .where(eq(medicationPlans.disease_id, diseaseId));
        
      setRelatedMeds(meds);

      // Načtení návštěv
      const vis = await db.select().from(visits).where(eq(visits.disease_id, diseaseId));
      
      // BEZPEČNÉ Seřazení od nejnovější (b) po nejstarší (a)
      vis.sort((a, b) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
      });
      
      setRelatedVisits(vis);
    } catch (e) { console.error("Chyba:", e); }
  };

  const openMedModal = async () => {
    try {
      const allMeds = await db.select({
        plan_id: medicationPlans.plan_id,
        disease_id: medicationPlans.disease_id,
        isSos: medicationPlans.is_sos,
        medName: inventory.medication_name,
        form: inventory.form,
        end_date: medicationPlans.end_date
      }).from(medicationPlans).innerJoin(inventory, eq(medicationPlans.inventory_id, inventory.inventory_id));
      
      setAvailableMeds(allMeds.filter(m => m.disease_id !== diseaseId));
      setShowMedModal(true);
    } catch(e) {}
  };

  const openVisitModal = async () => {
    try {
      const allVis = await db.select().from(visits);
      setAvailableVisits(allVis.filter(v => v.disease_id !== diseaseId));
      setShowVisitModal(true);
    } catch(e) {}
  };

  const handleLinkMed = async (planId: number) => {
    try {
      await db.update(medicationPlans).set({ disease_id: diseaseId }).where(eq(medicationPlans.plan_id, planId));
      setShowMedModal(false);
      loadDiseaseDetails();
    } catch(e) {}
  };

  const handleLinkVisit = async (vId: number) => {
    try {
      await db.update(visits).set({ disease_id: diseaseId }).where(eq(visits.visit_id, vId));
      setShowVisitModal(false);
      loadDiseaseDetails();
    } catch(e) {}
  };

  const handleUnlinkVisit = (vId: number) => {
    Alert.alert("Zrušit vazbu", "Opravdu chcete odebrat návštěvu od této diagnózy?", [
      { text: "Zrušit", style: "cancel" },
      { text: "Odebrat", style: "destructive", onPress: async () => {
          try {
            await db.update(visits).set({ disease_id: null }).where(eq(visits.visit_id, vId));
            loadDiseaseDetails();
          } catch(e) {}
      }}
    ]);
  };

  const handleUnlinkPlan = (pId: number) => {
    Alert.alert("Zrušit vazbu", "Opravdu chcete odebrat lék od této diagnózy?", [
      { text: "Zrušit", style: "cancel" },
      { text: "Odebrat", style: "destructive", onPress: async () => {
          try {
            await db.update(medicationPlans).set({ disease_id: null }).where(eq(medicationPlans.plan_id, pId));
            loadDiseaseDetails();
          } catch(e) {}
      }}
    ]);
  };

  const handleDeleteDisease = () => {
    Alert.alert("Smazat diagnózu", "Opravdu smazat?", [
        { text: "Zrušit", style: "cancel" },
        { text: "Smazat vše", style: "destructive", onPress: async () => {
            const plans = await db.select({ plan_id: medicationPlans.plan_id }).from(medicationPlans).where(eq(medicationPlans.disease_id, diseaseId));
            const planIds = plans.map(p => p.plan_id);
            if (planIds.length > 0) await db.delete(medicationLogs).where(inArray(medicationLogs.plan_id, planIds));
            await db.delete(medicationPlans).where(eq(medicationPlans.disease_id, diseaseId));
            await db.delete(visits).where(eq(visits.disease_id, diseaseId));
            await db.delete(diseases).where(eq(diseases.disease_id, diseaseId));
            router.back();
        }}
    ]);
  };

  const handleMarkAsHealed = () => {
    const activeMeds = relatedMeds.filter(m => m.end_date === null);
    const today = new Date().toISOString().split('T')[0];

    if (activeMeds.length > 0) {
      Alert.alert("Ukončit léčbu", "Máte aktivní medikace. Ukončit také?", [
          { text: "Zrušit", style: "cancel" },
          { text: "Ne, jen diagnózu", onPress: async () => {
              await db.update(diseases).set({ end_date: today }).where(eq(diseases.disease_id, diseaseId));
              loadDiseaseDetails();
          }},
          { text: "Ano, ukončit vše", style: "default", onPress: async () => {
              await db.update(diseases).set({ end_date: today }).where(eq(diseases.disease_id, diseaseId));
              await db.update(medicationPlans).set({ end_date: today }).where(eq(medicationPlans.disease_id, diseaseId));
              loadDiseaseDetails(); 
          }}
      ]);
    } else {
      Alert.alert("Ukončit léčbu", "Označit jako vyřešenou?", [
          { text: "Zrušit", style: "cancel" },
          { text: "Ano, jsem zdravý", style: "default", onPress: async () => {
              await db.update(diseases).set({ end_date: today }).where(eq(diseases.disease_id, diseaseId));
              loadDiseaseDetails(); 
          }}
      ]);
    }
  };

  const generatePdfReport = async () => {
    if (!disease) return;
    try {
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
            <title>Report Epizody - ${disease.disease_name}</title>
            <style>
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; line-height: 1.6; padding: 40px; }
                h1 { color: #111; border-bottom: 2px solid #2196F3; padding-bottom: 10px; margin-bottom: 10px; }
                .patient-name { font-size: 18px; color: #555; margin-bottom: 30px; }
                h2 { color: #2196F3; margin-top: 30px; font-size: 18px; }
                .badge { background-color: #E3F2FD; color: #2196F3; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
                .badge-history { background-color: #F5F5F5; color: #888; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { padding: 10px; text-align: left; border-bottom: 1px solid #EEE; vertical-align: top; }
                th { background-color: #F8F9FA; font-weight: bold; color: #555; font-size: 14px; text-transform: uppercase; }
                .info-grid { display: flex; gap: 40px; margin-bottom: 20px; flex-wrap: wrap; }
                .info-block strong { display: block; font-size: 12px; color: #AAA; text-transform: uppercase; letter-spacing: 1px; }
                .info-block span { font-size: 16px; font-weight: bold; }
                .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #AAA; border-top: 1px solid #EEE; padding-top: 20px; }
                .note-box { background-color: #F8F8F8; padding: 15px; border-radius: 8px; margin-top: 10px; }
                .visit-note { font-size: 13px; color: #666; margin-top: 4px; display: block; }
            </style>
        </head>
        <body>
            <h1>${disease.disease_name}</h1>
            <div class="patient-name">Pacient: <strong>${userName}</strong></div>
            <div class="info-grid">
                <div class="info-block">
                    <strong>Od kdy</strong>
                    <span>${new Date(disease.start_date).toLocaleDateString('cs-CZ')}</span>
                </div>
                <div class="info-block">
                    <strong>Do kdy</strong>
                    <span>${disease.end_date ? new Date(disease.end_date).toLocaleDateString('cs-CZ') : 'Stále probíhá'}</span>
                </div>
                <div class="info-block">
                    <strong>Stav / Typ</strong>
                    <span class="badge ${disease.end_date ? 'badge-history' : ''}">${disease.end_date ? 'Historie' : 'Aktuální'} • ${disease.type === 'ACUTE' ? 'Akutní' : 'Chronické'}</span>
                </div>
            </div>

            ${disease.note ? `<h2>Poznámky a zprávy</h2><div class="note-box">${disease.note.replace(/\n/g, '<br>')}</div>` : ''}

            <h2>Léky užívané na tuto diagnózu</h2>
            ${relatedMeds.length > 0 ? `
              <table>
                  <tr><th>Název léku</th><th>Dávkování / Režim</th><th>Stav užívání</th></tr>
                  ${relatedMeds.map(m => `
                      <tr>
                          <td><strong>${m.medName}</strong></td>
                          <td>${m.isSos ? 'Dle potřeby (SOS)' : formatDoses(m.doses_config, m.unit)}</td>
                          <td>${m.end_date ? `<span style="color:#888">Ukončeno</span>` : `<span style="color:#4CAF50; font-weight:bold">Aktivní</span>`}</td>
                      </tr>
                  `).join('')}
              </table>
            ` : '<p style="color:#888;">Žádné záznamy o lécích.</p>'}

            <h2>Návštěvy lékaře spojené s diagnózou</h2>
            ${relatedVisits.length > 0 ? `
              <table>
                  <tr><th>Lékař / Oddělení</th><th>Datum</th><th>Stav</th></tr>
                  ${relatedVisits.map(v => `
                      <tr>
                          <td>
                            <strong>${v.doctor || 'Neuvedeno'}</strong>
                            <br><span style="color:#666; font-size:12px;">${v.department || ''} ${v.department && v.hospital ? '•' : ''} ${v.hospital || ''}</span>
                            ${v.note ? `<span class="visit-note"><em>Poznámka:</em> ${v.note}</span>` : ''}
                          </td>
                          <td>${new Date(v.date).toLocaleDateString('cs-CZ')}</td>
                          <td>${v.status === 'COMPLETED' ? '<span style="color:#2196F3; font-weight:bold">Proběhla</span>' : '<span style="color:#FF9800; font-weight:bold">Plánována</span>'}</td>
                      </tr>
                  `).join('')}
              </table>
            ` : '<p style="color:#888;">Žádné záznamy o návštěvách.</p>'}

            <div class="footer">Tento report byl vygenerován z osobní zdravotní aplikace eZdraví dne ${new Date().toLocaleDateString('cs-CZ')}.</div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Sdílet report epizody', UTI: 'com.adobe.pdf' });
    } catch (e) {
      Alert.alert("Chyba", "Nepodařilo se vygenerovat PDF report.");
    }
  };

  if (!disease) return <SafeAreaView style={styles.safeArea}><Text style={{textAlign:'center', marginTop:50}}>Načítám...</Text></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} /> 
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ zIndex: 10 }}><MaterialCommunityIcons name="arrow-left" size={28} color="#333" /></TouchableOpacity>
        <Text style={[styles.headerTitle, { position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: 1 }]}>Detail Diagnózy</Text>
        <View style={{ flexDirection: 'row', gap: 15, zIndex: 10 }}>
          <TouchableOpacity onPress={() => router.push({ pathname: '/add-disease', params: { id: diseaseId } })}><MaterialCommunityIcons name="pencil-outline" size={26} color="#2196F3" /></TouchableOpacity>
          <TouchableOpacity onPress={handleDeleteDisease}><MaterialCommunityIcons name="trash-can-outline" size={26} color="#FF5252" /></TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.mainCard}>
          <View style={styles.titleRow}>
            <View style={[styles.iconBox, { backgroundColor: disease.end_date ? '#F5F5F5' : '#FFEBEB' }]}>
              <MaterialCommunityIcons name="thermometer" size={32} color={disease.end_date ? '#AAA' : '#FF5252'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.diseaseName}>{disease.disease_name}</Text>
              <Text style={[styles.diseaseType, { color: disease.end_date ? '#AAA' : '#FF5252', fontWeight: 'bold', fontSize: 12, letterSpacing: 0.5 }]}>
                {disease.end_date ? 'HISTORICKÉ / UZAVŘENÉ' : 'AKTUÁLNÍ / STÁLE PROBÍHÁ'}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <View>
              <Text style={styles.label}>OD KDY</Text>
              <Text style={styles.value}>{new Date(disease.start_date).toLocaleDateString('cs-CZ')}</Text>
            </View>
            <View>
              <Text style={styles.label}>KONEC</Text>
              {disease.end_date ? (
                <Text style={styles.value}>{new Date(disease.end_date).toLocaleDateString('cs-CZ')}</Text>
              ) : (
                <TouchableOpacity onPress={handleMarkAsHealed} style={{ backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 2, alignSelf: 'flex-start' }}>
                  <Text style={{ color: colors.third, fontWeight: 'bold', fontSize: 13 }}>Ukončit léčbu</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {disease.note && (
            <View style={styles.noteSection}><Text style={styles.label}>DIAGNÓZA A POZNÁMKY</Text><Text style={styles.noteText}>{disease.note}</Text></View>
          )}
        </View>

        {/* ---> RYCHLÉ AKCE <--- */}
        {!disease.end_date && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15, marginTop: -10 }}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#F4FBF5', borderColor: colors.fourth }]} onPress={openMedModal} activeOpacity={0.7}>
              <MaterialCommunityIcons name="pill-multiple" size={20} color={colors.fourth} />
              <Text style={[styles.actionBtnText, { color: colors.fourth }]}>Medikace</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#F4F9FF', borderColor: '#2196F3' }]} onPress={openVisitModal} activeOpacity={0.7}>
              <MaterialCommunityIcons name="stethoscope" size={20} color="#2196F3" />
              <Text style={[styles.actionBtnText, { color: '#2196F3' }]}>Návštěva</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity 
            style={{ backgroundColor: '#F0F0F0', padding: 15, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 25 }}
            activeOpacity={0.7} onPress={generatePdfReport}
        >
            <MaterialCommunityIcons name="file-pdf-box" size={22} color="#555" />
            <Text style={{ color: '#555', fontWeight: 'bold', fontSize: 14 }}>Exportovat report do PDF</Text>
        </TouchableOpacity>

        {/* --- SPJATÉ MEDIKACE --- */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#AAA', marginBottom: 10, letterSpacing: 1 }}>SPJATÉ MEDIKACE</Text>
          
          {relatedMeds.length === 0 && <Text style={styles.emptyText}>Zatím žádné připojené léky.</Text>}

          {relatedMeds.map((med, index) => {
            const isFromThisPlan = med.plan_id == fromPlanId;
            const isEnded = med.end_date !== null; 
            return (
              <TouchableOpacity key={index} style={styles.connectionCard} activeOpacity={0.7} disabled={isFromThisPlan} onPress={() => router.push({ pathname: '/medication-detail', params: { id: med.plan_id, ...historyParams } })}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isEnded ? '#F5F5F5' : '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name={med.form === 'SYRUP' ? 'medication-outline' : 'pill-multiple'} size={22} color={isEnded ? '#AAA' : colors.fourth} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: isEnded ? '#888' : '#333' }}>{med.medName}</Text>
                  <Text style={{ fontSize: 13, color: '#888' }}>{isFromThisPlan ? 'Aktuálně zobrazeno' : (med.isSos ? 'Podle potřeby (SOS)' : 'Pravidelný režim')}{isEnded ? ' • Ukončeno' : ''}</Text>
                </View>
                {!isFromThisPlan && (
                  <TouchableOpacity style={{ padding: 10, marginRight: -10 }} onPress={(e) => { e.stopPropagation(); handleUnlinkPlan(med.plan_id); }}>
                    <MaterialCommunityIcons name="dots-vertical" size={24} color="#888" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )
          })}
        </View>

        {/* --- NÁVŠTĚVY LÉKAŘE --- */}
        <View style={{ marginTop: 15, marginBottom: 40 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#AAA', marginBottom: 10, letterSpacing: 1 }}>NÁVŠTĚVY LÉKAŘE</Text>
          
          {relatedVisits.length === 0 && <Text style={styles.emptyText}>Zatím žádné připojené návštěvy.</Text>}

          {relatedVisits.map((visit, index) => {
            const isFromThisVisit = visit.visit_id == fromVisitId;
            const isVisitCompleted = visit.status === 'COMPLETED'; 
            return (
              <TouchableOpacity key={index} style={styles.connectionCard} activeOpacity={0.7} disabled={isFromThisVisit} onPress={() => router.push({ pathname: '/visit-detail', params: { id: visit.visit_id, ...historyParams } })}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isVisitCompleted ? '#F5F5F5' : '#E3F2FD', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name={isVisitCompleted ? "calendar-check" : "calendar-clock"} size={22} color={isVisitCompleted ? '#AAA' : '#2196F3'} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: isVisitCompleted ? '#888' : '#333' }}>{visit.doctor || 'Lékař'}</Text>
                  <Text style={{ fontSize: 13, color: '#666' }}>{isFromThisVisit ? 'Aktuálně zobrazeno' : `${visit.department || 'Oddělení'} • ${new Date(visit.date).toLocaleDateString('cs-CZ')}`}</Text>
                </View>
                {!isFromThisVisit && (
                  <TouchableOpacity style={{ padding: 10, marginRight: -10 }} onPress={(e) => { e.stopPropagation(); handleUnlinkVisit(visit.visit_id); }}>
                    <MaterialCommunityIcons name="dots-vertical" size={24} color="#888" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {/* --- MODAL PRO PŘIDÁNÍ MEDIKACE --- */}
      {showMedModal && (
        <Modal visible={true} animationType="fade" transparent onRequestClose={() => setShowMedModal(false)}>
          <TouchableOpacity style={styles.calOverlay} activeOpacity={1} onPress={() => setShowMedModal(false)}>
            <View style={styles.calContainer} onStartShouldSetResponder={() => true}>
              <View style={styles.calHeader}>
                <Text style={styles.calTitle}>Vybrat medikaci</Text>
                <TouchableOpacity onPress={() => setShowMedModal(false)}><MaterialCommunityIcons name="close" size={24} color="#333" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400, padding: 20 }}>
                <TouchableOpacity
                  style={[styles.connectionCard, { backgroundColor: '#F4FBF5', borderColor: colors.fourth }]}
                  onPress={() => { setShowMedModal(false); router.push({ pathname: '/add-medication', params: { preselected_disease_id: diseaseId } }); }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="plus" size={24} color={colors.fourth} />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.fourth }}>Vytvořit novou medikaci</Text>
                  </View>
                </TouchableOpacity>

                {availableMeds.length === 0 && <Text style={{ color: '#888', textAlign: 'center', marginTop: 10 }}>Žádné další dostupné medikace.</Text>}
                {availableMeds.map((med) => (
                  <TouchableOpacity key={med.plan_id} style={styles.connectionCard} onPress={() => handleLinkMed(med.plan_id)}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: med.end_date ? '#F5F5F5' : '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                      <MaterialCommunityIcons name={med.form === 'SYRUP' ? 'medication-outline' : 'pill-multiple'} size={20} color={med.end_date ? '#AAA' : colors.fourth} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: med.end_date ? '#888' : '#333' }}>{med.medName}</Text>
                      <Text style={{ fontSize: 13, color: '#888' }}>{med.isSos ? 'Podle potřeby (SOS)' : 'Pravidelný režim'}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* --- MODAL PRO PŘIDÁNÍ NÁVŠTĚVY --- */}
      {showVisitModal && (
        <Modal visible={true} animationType="fade" transparent onRequestClose={() => setShowVisitModal(false)}>
          <TouchableOpacity style={styles.calOverlay} activeOpacity={1} onPress={() => setShowVisitModal(false)}>
            <View style={styles.calContainer} onStartShouldSetResponder={() => true}>
              <View style={styles.calHeader}>
                <Text style={styles.calTitle}>Vybrat návštěvu</Text>
                <TouchableOpacity onPress={() => setShowVisitModal(false)}><MaterialCommunityIcons name="close" size={24} color="#333" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400, padding: 20 }}>
                <TouchableOpacity
                  style={[styles.connectionCard, { backgroundColor: '#F4F9FF', borderColor: '#2196F3' }]}
                  onPress={() => { setShowVisitModal(false); router.push({ pathname: '/add-visit', params: { preselected_disease_id: diseaseId } }); }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="plus" size={24} color="#2196F3" />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2196F3' }}>Zapsat novou návštěvu</Text>
                  </View>
                </TouchableOpacity>

                {availableVisits.length === 0 && <Text style={{ color: '#888', textAlign: 'center', marginTop: 10 }}>Žádné další dostupné návštěvy.</Text>}
                {availableVisits.sort((a,b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).map((v) => (
                  <TouchableOpacity key={v.visit_id} style={styles.connectionCard} onPress={() => handleLinkVisit(v.visit_id)}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: v.status === 'COMPLETED' ? '#F5F5F5' : '#E3F2FD', justifyContent: 'center', alignItems: 'center' }}>
                      <MaterialCommunityIcons name={v.status === 'COMPLETED' ? "calendar-check" : "calendar-clock"} size={20} color={v.status === 'COMPLETED' ? '#AAA' : '#2196F3'} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>{v.doctor || 'Lékař'}</Text>
                      <Text style={{ fontSize: 13, color: '#888' }}>{new Date(v.date).toLocaleDateString('cs-CZ')}</Text>
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
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  content: { padding: 20 },
  mainCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3, marginBottom: 30 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 60, height: 60, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  diseaseName: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  diseaseType: { fontSize: 14, color: '#888', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 20 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 40 },
  label: { fontSize: 11, fontWeight: '800', color: '#AAA', letterSpacing: 1, marginBottom: 5 },
  value: { fontSize: 16, fontWeight: '600', color: '#333' },
  noteSection: { marginTop: 20, backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12 },
  noteText: { fontSize: 15, color: '#444', lineHeight: 22, marginTop: 5 },
  connectionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EEE', marginBottom: 10 },
  calOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  calContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  calTitle: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 6 },
  actionBtnText: { fontWeight: 'bold', fontSize: 14 },
  emptyText: { color: '#AAA', fontStyle: 'italic', marginBottom: 15, marginLeft: 5 },
});