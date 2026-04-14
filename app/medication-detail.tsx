import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, TextInput, Keyboard } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import CalendarPicker from '@/components/CalendarPicker';
import colors from '@/components/colors';
import { db } from '../db';
import { medicationPlans, diseases, medicationLogs, inventory } from '../db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { useIsFocused } from '@react-navigation/native';

const getSafeDate = (val: any): Date => {
  if (!val || val === 'null' || val === '') return new Date();
  try {
    if (typeof val === 'string') {
      const clean = val.split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (!isNaN(d.getTime()) && d.getFullYear() >= 1990) return d;
      }
    }
    const d = new Date(val);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 1990) return d;
  } catch {}
  return new Date();
};

const getLocalDateStr = (d: Date) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
const getLocalTimeStr = (d: Date) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
const dateFromStr = (s: string): Date => { const p = s.split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); };

export default function MedicationDetailScreen() {
  const router = useRouter();
  const { id, from_disease_id, from_inventory_id, from_visit_id } = useLocalSearchParams();
  const planId = Number(id);
  const fromDiseaseId = from_disease_id ? Number(from_disease_id) : null;
  const fromInventoryId = from_inventory_id ? Number(from_inventory_id) : null;
  const fromVisitId = from_visit_id ? Number(from_visit_id) : null;
  const isFocused = useIsFocused();

  const [plan, setPlan] = useState<any>(null);
  const [linkedDisease, setLinkedDisease] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [totalTaken, setTotalTaken] = useState(0);

  const [showLogFormModal, setShowLogFormModal] = useState<'ADD' | 'EDIT' | null>(null);
  const [editingLog, setEditingLog] = useState<any>(null);
  const [logAmount, setLogAmount] = useState('1');
  
  const [logAddDate, setLogAddDate] = useState<Date>(new Date());
  const [logEditDate, setLogEditDate] = useState<Date>(new Date());
  const [logAddTime, setLogAddTime] = useState<Date>(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; });
  const [logEditTime, setLogEditTime] = useState<Date>(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; });

  const [isAddDatePickerVisible, setAddDatePickerVisible] = useState(false);
  const [isAddTimePickerVisible, setAddTimePickerVisible] = useState(false);
  const [isEditDatePickerVisible, setEditDatePickerVisible] = useState(false);
  const [isEditTimePickerVisible, setEditTimePickerVisible] = useState(false);

  const [allDiseases, setAllDiseases] = useState<any[]>([]);
  const [showDiseaseModal, setShowDiseaseModal] = useState(false);

  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [allInventory, setAllInventory] = useState<any[]>([]);
  const [pastInventories, setPastInventories] = useState<any[]>([]);

  const [showAllHistoryBoxes, setShowAllHistoryBoxes] = useState(false);

  useEffect(() => {
    if (isFocused && planId) { loadPlanDetails(); loadHistoryLogs(); }
  }, [isFocused, planId]);

  const loadPlanDetails = async () => {
    try {
      const planData = await db.select({
        plan_id: medicationPlans.plan_id, inventory_id: medicationPlans.inventory_id, is_sos: medicationPlans.is_sos, interval_hint: medicationPlans.interval_hint, doses_config: medicationPlans.doses_config, disease_id: medicationPlans.disease_id, start_date: medicationPlans.start_date, end_date: medicationPlans.end_date, medication_name: inventory.medication_name, form: inventory.form, unit: inventory.unit, remaining_qty: inventory.remaining_qty, inventory_status: inventory.status, expiration_date: inventory.expiration_date,
      }).from(medicationPlans).innerJoin(inventory, eq(medicationPlans.inventory_id, inventory.inventory_id)).where(eq(medicationPlans.plan_id, planId));

      if (planData.length > 0) {
        setPlan(planData[0]);
        if (planData[0].disease_id) {
          const diseaseData = await db.select().from(diseases).where(eq(diseases.disease_id, planData[0].disease_id));
          if (diseaseData.length > 0) setLinkedDisease(diseaseData[0]);
        } else { setLinkedDisease(null); }
        
        const diseasesList = await db.select().from(diseases);
        setAllDiseases(diseasesList);

        // Načtení aktivních krabiček pro Modal výměny
        const invList = await db.select().from(inventory).where(eq(inventory.status, 'ACTIVE'));
        setAllInventory(invList);

        // Identifikace vyřazených (historických) krabiček z logů užívání
        const planLogs = await db.select().from(medicationLogs).where(eq(medicationLogs.plan_id, planId));
        const usedInvIds = Array.from(new Set(planLogs.map(l => l.inventory_id))).filter(id => id !== planData[0].inventory_id && id !== null);
        if (usedInvIds.length > 0) {
           const pBoxes = await db.select().from(inventory).where(inArray(inventory.inventory_id, usedInvIds as number[]));
           setPastInventories(pBoxes);
        } else {
           setPastInventories([]);
        }
      }
    } catch (e) {}
  };

  const loadHistoryLogs = async () => {
    try {
      const logsData = await db.select().from(medicationLogs).where(eq(medicationLogs.plan_id, planId)).orderBy(desc(medicationLogs.taken_at));
      setLogs(logsData);
      setTotalTaken(logsData.reduce((sum, log) => sum + (log.amount || 0), 0));
    } catch (e) {}
  };

  const groupedLogs = (() => {
    const groups: { [key: string]: any[] } = {};
    logs.forEach(log => {
      const dateStr = log.scheduled_date || new Date(log.taken_at).toISOString().split('T')[0];
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push(log);
    });
    return groups;
  })();
  const sortedDates = Object.keys(groupedLogs).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const getBounds = () => {
    let minD = new Date(2000, 0, 1);
    let maxD = new Date();
    maxD.setHours(23, 59, 59, 0);
    if (plan?.start_date) { const s = getSafeDate(plan.start_date); if (s > minD) minD = s; }
    if (linkedDisease?.start_date) { const s = getSafeDate(linkedDisease.start_date); if (s > minD) minD = s; }
    if (plan?.end_date) { const e = getSafeDate(plan.end_date); if (e < maxD) maxD = e; }
    if (linkedDisease?.end_date) { const e = getSafeDate(linkedDisease.end_date); if (e < maxD) maxD = e; }
    return { min: minD, max: maxD };
  };
  const bounds = getBounds();

  const handleRemoveLog = (logId: number, amountToReturn: number, targetInventoryId: number) => {
    Alert.alert("Smazat záznam z historie", "Opravdu chceš tento záznam smazat? Lék se vrátí zpět do krabičky.", [
      { text: "Zrušit", style: "cancel" },
      { text: "Smazat", style: "destructive", onPress: async () => {
          try {
            await db.delete(medicationLogs).where(eq(medicationLogs.log_id, logId));
            const targetInv = await db.select().from(inventory).where(eq(inventory.inventory_id, targetInventoryId));
            if (targetInv.length > 0) {
               const newQty = targetInv[0].remaining_qty + amountToReturn;
               const newStatus = (targetInv[0].status === 'DEPLETED' && newQty > 0) ? 'ACTIVE' : targetInv[0].status;
               await db.update(inventory).set({ remaining_qty: newQty, status: newStatus, depleted_at: newStatus === 'ACTIVE' ? null : targetInv[0].depleted_at }).where(eq(inventory.inventory_id, targetInventoryId));
            }
            loadPlanDetails(); loadHistoryLogs();
          } catch (e) {}
      }}
    ]);
  };

  const handleUnlinkDisease = () => {
    Alert.alert("Zrušit vazbu", "Opravdu chcete odebrat vazbu na tuto diagnózu?", [
      { text: "Zrušit", style: "cancel" },
      { text: "Odebrat", style: "destructive", onPress: async () => {
          try {
            await db.update(medicationPlans).set({ disease_id: null }).where(eq(medicationPlans.plan_id, planId));
            loadPlanDetails();
          } catch(e) { Alert.alert("Chyba", "Nepodařilo se odebrat vazbu."); }
      }}
    ]);
  };

  const openAddLogModal = () => {
    let defaultDate = new Date();
    if (bounds.max && bounds.max < defaultDate) defaultDate = bounds.max;
    if (bounds.min && bounds.min > defaultDate) defaultDate = bounds.min;
    setLogAddDate(defaultDate);
    
    const defaultTime = new Date(defaultDate);
    defaultTime.setHours(8, 0, 0, 0);
    setLogAddTime(defaultTime);
    
    setLogAmount('1'); 
    setShowLogFormModal('ADD');
  };

  const openEditLogModal = (log: any) => {
    setEditingLog(log); setLogAmount(log.amount.toString());
    try {
      const [year, month, day] = (log.scheduled_date || getLocalDateStr(new Date())).split('-');
      const [hours, minutes] = (log.scheduled_time || '00:00').split(':');
      const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));
      setLogEditDate(parsedDate);
      
      const parsedTime = new Date(parsedDate);
      parsedTime.setHours(Number(hours), Number(minutes), 0, 0);
      setLogEditTime(parsedTime);
    } catch (e) {
      setLogEditDate(new Date(log.taken_at));
      setLogEditTime(new Date(log.taken_at));
    }
    setShowLogFormModal('EDIT');
  };

  const handleSaveAddLog = async (timeStr: string, amount: number) => {
    Keyboard.dismiss();
    try {
      const targetInv = await db.select().from(inventory).where(eq(inventory.inventory_id, plan.inventory_id));
      if (targetInv.length === 0 || targetInv[0].remaining_qty < amount) return Alert.alert("Málo zásob", "V aktuální krabičce není dost léků.");
      const dateStr = getLocalDateStr(logAddDate);
      if (logs.find(l => l.scheduled_date === dateStr && l.scheduled_time === timeStr) && !plan.is_sos) return Alert.alert("Pozor", "Tento čas už máš dnes odškrtnutý.");
      await db.insert(medicationLogs).values({ plan_id: planId, inventory_id: plan.inventory_id, scheduled_date: dateStr, scheduled_time: timeStr, taken_at: new Date().toISOString(), amount: amount, status: 'TAKEN' });
      const newQty = targetInv[0].remaining_qty - amount;
      await db.update(inventory).set({ remaining_qty: newQty, status: newQty <= 0 ? 'DEPLETED' : targetInv[0].status, depleted_at: newQty <= 0 ? new Date().toISOString() : targetInv[0].depleted_at }).where(eq(inventory.inventory_id, plan.inventory_id));
      setShowLogFormModal(null); loadPlanDetails(); loadHistoryLogs();
    } catch (e) { Alert.alert("Chyba", "Nepodařilo se přidat záznam."); }
  };

  const handleSaveEditLog = async () => {
    Keyboard.dismiss();
    const newAmount = parseFloat(logAmount.replace(',', '.')) || 0;
    if (newAmount <= 0) return Alert.alert("Chyba", "Množství musí být větší než 0.");
    const amountDiff = newAmount - editingLog.amount; 
    try {
      if (amountDiff !== 0) {
        const targetInv = await db.select().from(inventory).where(eq(inventory.inventory_id, editingLog.inventory_id));
        if (targetInv.length > 0) {
          if (amountDiff > 0 && targetInv[0].remaining_qty < amountDiff) return Alert.alert("Málo zásob", "V původní krabičce už není dost léků.");
          const newQty = targetInv[0].remaining_qty - amountDiff;
          const newStatus = (targetInv[0].status === 'DEPLETED' && newQty > 0) ? 'ACTIVE' : (newQty <= 0 ? 'DEPLETED' : targetInv[0].status);
          await db.update(inventory).set({ remaining_qty: newQty, status: newStatus, depleted_at: newStatus === 'ACTIVE' ? null : (newQty <= 0 && targetInv[0].status !== 'DEPLETED' ? new Date().toISOString() : targetInv[0].depleted_at) }).where(eq(inventory.inventory_id, editingLog.inventory_id));
        }
      }
      const finalDateTime = new Date(logEditDate);
      finalDateTime.setHours(logEditTime.getHours(), logEditTime.getMinutes(), 0, 0);
      await db.update(medicationLogs).set({ amount: newAmount, scheduled_date: getLocalDateStr(finalDateTime), scheduled_time: getLocalTimeStr(finalDateTime), taken_at: finalDateTime.toISOString() }).where(eq(medicationLogs.log_id, editingLog.log_id));
      setShowLogFormModal(null); loadPlanDetails(); loadHistoryLogs();
    } catch (e) { Alert.alert("Chyba", "Nepodařilo se upravit záznam."); }
  };

  if (!plan) return <SafeAreaView style={styles.safeArea}><Text style={{ textAlign: 'center', marginTop: 50 }}>Načítám...</Text></SafeAreaView>;

  // Logika ukončení - plán je ukončený, pokud má datum konce NEBO pokud je diagnóza ukončená
  const isPlanEnded = plan.end_date !== null;
  const isDiseaseEnded = linkedDisease && linkedDisease.end_date !== null;
  const isEnded = isPlanEnded || isDiseaseEnded;

  let parsedSchedules: any[] = [];
  if (!plan.is_sos) { try { parsedSchedules = JSON.parse(plan.doses_config); } catch (e) {} }
  const availableDosesForAddDate = parsedSchedules.filter(s => s.days.includes((logAddDate.getDay() || 7).toString())).flatMap(s => s.doses).sort((a,b) => a.time.localeCompare(b.time));

  return (
    <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
        <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={{ zIndex: 10 }}><MaterialCommunityIcons name="arrow-left" size={28} color="#333" /></TouchableOpacity>
            <Text style={[styles.headerTitle, { position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: 1 }]}>Detail Medikace</Text>
            <View style={{ flexDirection: 'row', gap: 15, zIndex: 10 }}>
              {!isEnded && (<TouchableOpacity onPress={() => router.push({ pathname: '/add-medication', params: { id: planId } })}><MaterialCommunityIcons name="pencil-outline" size={26} color="#2196F3" /></TouchableOpacity>)}
              <TouchableOpacity onPress={() => {
                Alert.alert('Smazat medikaci', 'Opravdu chceš smazat tento léčebný režim? Všechny záznamy užívání budou také smazány.', [
                  { text: 'Zrušit', style: 'cancel' },
                  { text: 'Smazat', style: 'destructive', onPress: async () => {
                    try {
                      await db.delete(medicationLogs).where(eq(medicationLogs.plan_id, planId));
                      await db.delete(medicationPlans).where(eq(medicationPlans.plan_id, planId));
                      router.back();
                    } catch (e) { Alert.alert('Chyba', 'Nepodařilo se smazat medikaci.'); }
                  }}
                ]);
              }}>
                <MaterialCommunityIcons name="trash-can-outline" size={26} color="#FF5252" />
              </TouchableOpacity>
            </View>
        </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.mainCard}>
          <View style={styles.titleRow}>
            <View style={[styles.iconBox, { backgroundColor: isEnded ? '#F5F5F5' : '#E8F5E9' }]}><MaterialCommunityIcons name={plan.form === 'SYRUP' ? 'medication-outline' : 'pill-multiple'} size={32} color={isEnded ? '#AAA' : colors.fourth} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.medName, isEnded && { color: '#888' }]}>{plan.medication_name}</Text><Text style={styles.medType}>{plan.is_sos ? 'Podle potřeby (SOS)' : 'Pravidelné užívání'}{isEnded ? ' • Ukončeno' : ''}</Text></View>
          </View>
          <View style={styles.divider} />
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <View>
              <Text style={styles.label}>DOBA UŽÍVÁNÍ</Text>
              <Text style={[styles.value, { fontSize: 16, color: isEnded ? '#888' : '#333' }]}>
                {new Date(plan.start_date).toLocaleDateString('cs-CZ')} – {plan.end_date ? new Date(plan.end_date).toLocaleDateString('cs-CZ') : 'Neurčeno'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.label}>CELKEM VZATO</Text>
              <Text style={[styles.value, { fontSize: 16, color: isEnded ? '#888' : colors.third }]}>{totalTaken} {plan.unit}</Text>
            </View>
          </View>

        <Text style={[styles.label, { marginBottom: 10 }]}>{plan.is_sos ? 'INSTRUKCE (SOS)' : 'PLÁN UŽÍVÁNÍ'}</Text>
          
          {plan.is_sos ? (
            <View style={{ backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12 }}>
              <Text style={{ fontSize: 15, color: isEnded ? '#888' : '#444', fontWeight: '500' }}>
                {plan.interval_hint || 'Dle potřeby'}
              </Text>
            </View>
          ) : (
            parsedSchedules.map((sched: any, sIdx: number) => (
              <View key={sIdx} style={{ backgroundColor: '#F8F8F8', borderRadius: 16, padding: 15, marginBottom: 10 }}>
                {/* Dny v týdnu */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                  {[{ id: '1', label: 'Po' }, { id: '2', label: 'Út' }, { id: '3', label: 'St' }, { id: '4', label: 'Čt' }, { id: '5', label: 'Pá' }, { id: '6', label: 'So' }, { id: '7', label: 'Ne' }].map(d => {
                    const isSelected = sched.days.includes(d.id);
                    return (
                      <View key={d.id} style={{ width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: isSelected ? (isEnded ? '#CCC' : colors.third) : '#FFF', borderWidth: isSelected ? 0 : 1, borderColor: '#EEE' }}>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: isSelected ? '#FFF' : '#AAA' }}>{d.label}</Text>
                      </View>
                    );
                  })}
                </View>
                
                {/* Časy a dávky */}
                {sched.doses.map((dose: any, dIdx: number) => (
                  <View key={dIdx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 12, borderRadius: 12, marginBottom: dIdx === sched.doses.length - 1 ? 0 : 8, borderWidth: 1, borderColor: '#EEE' }}>
                    <MaterialCommunityIcons name="clock-outline" size={20} color={isEnded ? '#AAA' : colors.third} />
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: isEnded ? '#888' : '#333', marginLeft: 10 }}>{dose.time}</Text>
                    <View style={{ flex: 1 }} />
                    <View style={{ backgroundColor: isEnded ? '#F5F5F5' : '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: 'bold', color: isEnded ? '#888' : colors.third }}>{dose.amount} {plan.unit}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>

        {/* --- VAZBY: SOUVISÍ S DIAGNÓZOU A ČERPÁNO Z LÉKÁRNIČKY --- */}
        <Text style={styles.sectionLabel}>SOUVISÍ S DIAGNÓZOU</Text>
        {linkedDisease ? (
          <TouchableOpacity
            style={[styles.linkCard, fromDiseaseId === linkedDisease.disease_id && styles.linkCardDisabled]}
            disabled={fromDiseaseId === linkedDisease.disease_id}
            onPress={() => router.push({ pathname: '/disease-detail', params: { id: linkedDisease.disease_id, from_plan_id: planId } })}
          >
            <View style={[styles.iconBoxSmall, { backgroundColor: '#FFEBEB' }]}>
              <MaterialCommunityIcons name="thermometer" size={24} color="#FF5252" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkCardTitle}>{linkedDisease.disease_name}</Text>
              {fromDiseaseId === linkedDisease.disease_id ? (
                <Text style={styles.linkCardSub}>Aktuálně zobrazeno</Text>
              ) : (
                <Text style={styles.linkCardSub}>{linkedDisease.end_date ? 'Ukončeno' : 'Probíhá'}</Text>
              )}
            </View>
            {fromDiseaseId !== linkedDisease.disease_id && (
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
          <TouchableOpacity 
            style={[styles.connectionCard, { backgroundColor: '#FFF5F5', borderColor: '#FF5252', marginTop: 0 }]}
            onPress={() => setShowDiseaseModal(true)}
          >
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFEBEB', justifyContent: 'center', alignItems: 'center' }}>
              <MaterialCommunityIcons name="plus" size={24} color="#FF5252" />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FF5252' }}>Propojit s diagnózou</Text>
              <Text style={{ fontSize: 13, color: '#666' }}>Tento lék je teď preventivní</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
          <Text style={[styles.sectionLabel, { marginTop: 0, marginBottom: 0 }]}>ČERPÁNO Z LÉKÁRNIČKY</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {pastInventories.length > 1 && (
              <TouchableOpacity onPress={() => setShowAllHistoryBoxes(!showAllHistoryBoxes)}>
                <Text style={{ color: colors.third, fontSize: 13, fontWeight: 'bold' }}>
                  {showAllHistoryBoxes ? 'Skrýt historii' : `+${pastInventories.length - 1} starších`}
                </Text>
              </TouchableOpacity>
            )}
            {plan.remaining_qty <= 0 && !isEnded && (
              <TouchableOpacity onPress={() => setShowInventoryModal(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF5F5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FFCDD2' }}>
                <MaterialCommunityIcons name="swap-horizontal" size={16} color="#FF5252" />
                <Text style={{ color: '#FF5252', fontSize: 12, fontWeight: 'bold' }}>Vyměnit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 1. Aktuální (nebo prázdná) krabička */}
        <TouchableOpacity
          style={[styles.linkCard, fromInventoryId === plan.inventory_id && styles.linkCardDisabled, plan.remaining_qty <= 0 && { borderColor: '#FFCDD2', borderWidth: 1 }]}
          disabled={fromInventoryId === plan.inventory_id}
          onPress={() => router.push({ pathname: '/inventory-detail', params: { id: plan.inventory_id, from_plan_id: planId } })}
        >
          <View style={[styles.iconBoxSmall, { backgroundColor: plan.remaining_qty <= 0 ? '#FFF5F5' : '#E8F5E9' }]}>
            <MaterialCommunityIcons name={plan.form === 'SYRUP' ? 'medication' : 'pill'} size={24} color={plan.remaining_qty <= 0 ? '#FF5252' : colors.third} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkCardTitle}>{plan.medication_name}</Text>
            <Text style={[styles.linkCardSub, plan.remaining_qty <= 0 && { color: '#FF5252', fontWeight: 'bold' }]}>
               {plan.remaining_qty <= 0 ? '⚠️ Krabička je prázdná' : `Zbývá: ${plan.remaining_qty} ${plan.unit}`}
            </Text>
          </View>
          {fromInventoryId !== plan.inventory_id && <MaterialCommunityIcons name="chevron-right" size={24} color="#CCC" />}
        </TouchableOpacity>

        {/* 2. Vyřazené (historické) krabičky s omezovačem */}
        {(showAllHistoryBoxes ? pastInventories : pastInventories.slice(0, 1)).map(pastInv => (
           <TouchableOpacity
             key={pastInv.inventory_id}
             style={[styles.linkCard, { backgroundColor: '#F8F8F8', borderColor: '#EEE' }]}
             onPress={() => router.push({ pathname: '/inventory-detail', params: { id: pastInv.inventory_id, from_plan_id: planId } })}
           >
             <View style={[styles.iconBoxSmall, { backgroundColor: '#F0F0F0' }]}>
               <MaterialCommunityIcons name="archive-outline" size={20} color="#AAA" />
             </View>
             <View style={{ flex: 1 }}>
               <Text style={[styles.linkCardTitle, { color: '#888' }]}>{pastInv.medication_name}</Text>
               <Text style={styles.linkCardSub}>Spotřebovaná (historická) zásoba</Text>
             </View>
             <MaterialCommunityIcons name="chevron-right" size={20} color="#CCC" />
           </TouchableOpacity>
        ))}
        {/* -------------------------------------------------------- */}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 20 }}>
          <Text style={styles.sectionTitle}>Historie užívání</Text>
          {!isEnded && (
            <TouchableOpacity onPress={openAddLogModal} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, padding: 5 }}><MaterialCommunityIcons name="plus-circle" size={20} color={colors.third} /><Text style={{ color: colors.third, fontWeight: 'bold' }}>Přidat záznam</Text></TouchableOpacity>
          )}
        </View>

      {sortedDates.length === 0 && (
        <Text style={{ color: '#AAA', fontStyle: 'italic', marginTop: 10 }}>Zatím žádné záznamy.</Text>
      )}
      {sortedDates.map(dateStr => {
        const dayLogs = groupedLogs[dateStr];
        const dateObj = dateFromStr(dateStr);
        const dateLabel = dateObj.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
        return (
          <View key={dateStr} style={styles.historyDayBlock}>
            <Text style={styles.historyDateHeader}>{dateLabel}</Text>
            <View style={styles.historyLogContainer}>
              {dayLogs.map((log: any) => (
                <View key={log.log_id} style={styles.historyLogRow}>
                  <View style={styles.historyLogLeft}>
                    <Text style={styles.historyLogTime}>{log.scheduled_time || getLocalTimeStr(new Date(log.taken_at))}</Text>
                  </View>
                  <View style={styles.historyLogRight}>
                    <Text style={styles.historyLogAmount}>Vzato {log.amount} {plan.unit}</Text>
                    <TouchableOpacity style={styles.editLogBtn} onPress={() => openEditLogModal(log)}>
                      <MaterialCommunityIcons name="pencil-outline" size={18} color="#2196F3" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteLogBtn} onPress={() => handleRemoveLog(log.log_id, log.amount, log.inventory_id)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF5252" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>

    {showLogFormModal && (
      <Modal visible={true} animationType="fade" transparent onRequestClose={() => setShowLogFormModal(null)}>
        <TouchableOpacity style={styles.modalOverlayClean} activeOpacity={1} onPress={() => setShowLogFormModal(null)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{showLogFormModal === 'ADD' ? 'Přidat zapomenutý lék' : 'Upravit záznam'}</Text>
              <TouchableOpacity onPress={() => setShowLogFormModal(null)}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 20 }}>
              {showLogFormModal === 'EDIT' && (
                <>
                  <Text style={styles.label}>MNOŽSTVÍ ({plan?.unit})</Text>
                  <TextInput
                    style={[styles.input, { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 }]}
                    keyboardType="decimal-pad" value={logAmount} onChangeText={setLogAmount}
                  />
                </>
              )}

              <Text style={styles.label}>{showLogFormModal === 'ADD' ? 'VYBERTE DATUM' : 'DATUM A ČAS'}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.datePickerBtn, { flex: 1 }]}
                  onPress={() => {
                    Keyboard.dismiss();
                    if (showLogFormModal === 'ADD') setAddDatePickerVisible(true);
                    else setEditDatePickerVisible(true);
                  }}
                >
                  <MaterialCommunityIcons name="calendar" size={20} color="#666" />
                  <Text style={styles.datePickerText}>
                    {showLogFormModal === 'ADD' ? logAddDate.toLocaleDateString('cs-CZ') : logEditDate.toLocaleDateString('cs-CZ')}
                  </Text>
                </TouchableOpacity>

                {(showLogFormModal === 'EDIT' || plan.is_sos) && (
                  <TouchableOpacity
                    style={[styles.datePickerBtn, { flex: 1 }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      if (showLogFormModal === 'ADD') setAddTimePickerVisible(true);
                      else setEditTimePickerVisible(true);
                    }}
                  >
                    <MaterialCommunityIcons name="clock-outline" size={20} color="#666" />
                    <Text style={styles.datePickerText}>
                      {showLogFormModal === 'ADD' ? getLocalTimeStr(logAddTime) : getLocalTimeStr(logEditTime)}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {showLogFormModal === 'ADD' && plan.is_sos && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, alignItems: 'center' }}>
                  <Text style={styles.label}>MNOŽSTVÍ ({plan?.unit})</Text>
                  <TextInput
                    style={[styles.input, { flex: 1, fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginTop: 0 }]}
                    keyboardType="decimal-pad" value={logAmount} onChangeText={setLogAmount}
                  />
                </View>
              )}

              {showLogFormModal === 'EDIT' || plan.is_sos ? (
                <TouchableOpacity
                  style={styles.btnPrim}
                  onPress={showLogFormModal === 'EDIT'
                    ? handleSaveEditLog
                    : () => handleSaveAddLog(getLocalTimeStr(logAddTime), parseFloat(logAmount.replace(',', '.')) || 0)}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold', textAlign: 'center', fontSize: 16 }}>
                    {showLogFormModal === 'EDIT' ? 'Uložit úpravy' : 'Uložit záznam'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
                  <Text style={[styles.label, { width: '100%' }]}>PŘEDEPSANÉ DÁVKY PRO TENTO DEN</Text>
                  {availableDosesForAddDate.length === 0 ? (
                    <Text style={{ color: '#888', marginTop: 10, fontStyle: 'italic' }}>V tento den nejsou naplánované žádné dávky.</Text>
                  ) : (
                    availableDosesForAddDate.map((dose: any, idx: number) => {
                      const isAlreadyTaken = logs.some(l => l.scheduled_date === getLocalDateStr(logAddDate) && l.scheduled_time === dose.time);
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.checkPill, isAlreadyTaken && { backgroundColor: '#F0F0F0', opacity: 0.5 }]}
                          disabled={isAlreadyTaken}
                          onPress={() => handleSaveAddLog(dose.time, dose.amount)}
                        >
                          <Text style={styles.checkPillText}>{dose.time} ({dose.amount} {plan.unit})</Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              )}
            </View>

            <CalendarPicker
              visible={isAddDatePickerVisible}
              title="Datum záznamu"
              currentDate={getLocalDateStr(logAddDate)}
              markedDates={{ [getLocalDateStr(logAddDate)]: { selected: true, selectedColor: colors.third } }}
              onDayPress={(day) => { setLogAddDate(dateFromStr(day.dateString)); setAddDatePickerVisible(false); }}
              onClose={() => setAddDatePickerVisible(false)}
              minDate={getLocalDateStr(bounds.min)}
              maxDate={getLocalDateStr(bounds.max)}
              themeColor={colors.third}
            />

            <CalendarPicker
              visible={isEditDatePickerVisible}
              title="Datum záznamu"
              currentDate={getLocalDateStr(logEditDate)}
              markedDates={{ [getLocalDateStr(logEditDate)]: { selected: true, selectedColor: colors.third } }}
              onDayPress={(day) => {
                const d = dateFromStr(day.dateString);
                const n = new Date(logEditDate);
                n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                setLogEditDate(n);
                setEditDatePickerVisible(false);
              }}
              onClose={() => setEditDatePickerVisible(false)}
              minDate={getLocalDateStr(bounds.min)}
              maxDate={getLocalDateStr(bounds.max)}
              themeColor={colors.third}
            />

            <DateTimePickerModal
              isVisible={isAddTimePickerVisible}
              mode="time"
              date={new Date(logAddTime)}
              onConfirm={(d) => { setLogAddTime(d); setAddTimePickerVisible(false); }}
              onCancel={() => setAddTimePickerVisible(false)}
              locale="cs-CZ"
              display="spinner"
              themeVariant="light"
              buttonTextColorIOS={colors.third}
              confirmTextIOS="Potvrdit"
              cancelTextIOS="Zrušit"
              is24Hour
            />

            <DateTimePickerModal
              isVisible={isEditTimePickerVisible}
              mode="time"
              date={new Date(logEditTime)}
              onConfirm={(d) => { setLogEditTime(d); setEditTimePickerVisible(false); }}
              onCancel={() => setEditTimePickerVisible(false)}
              locale="cs-CZ"
              display="spinner"
              themeVariant="light"
              buttonTextColorIOS={colors.third}
              confirmTextIOS="Potvrdit"
              cancelTextIOS="Zrušit"
              is24Hour
            />
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
              <TouchableOpacity onPress={() => setShowDiseaseModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
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
                        // Uloží to vazbu přímo do DB a aktualizuje data
                        await db.update(medicationPlans).set({ disease_id: disease.disease_id }).where(eq(medicationPlans.plan_id, planId));
                        setShowDiseaseModal(false);
                        loadPlanDetails();
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
    {showInventoryModal && (
      <Modal visible={true} animationType="fade" transparent onRequestClose={() => setShowInventoryModal(false)}>
        <TouchableOpacity style={styles.calOverlay} activeOpacity={1} onPress={() => setShowInventoryModal(false)}>
          <View style={styles.calContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.calHeader}>
              <Text style={styles.calTitle}>Vybrat novou krabičku</Text>
              <TouchableOpacity onPress={() => setShowInventoryModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400, padding: 20 }}>
              <TouchableOpacity
                style={[styles.connectionCard, { backgroundColor: '#F0FDF4', borderColor: colors.third }]}
                onPress={() => { setShowInventoryModal(false); router.push('/add-inventory'); }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="plus" size={24} color={colors.third} />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.third }}>Přidat novou do lékárničky</Text>
                </View>
              </TouchableOpacity>

              {allInventory.map(inv => (
                <TouchableOpacity key={inv.inventory_id} style={styles.connectionCard} onPress={async () => {
                    try {
                       // Vymění referenci v Plánu na novou krabičku
                       await db.update(medicationPlans).set({ inventory_id: inv.inventory_id }).where(eq(medicationPlans.plan_id, planId));
                       setShowInventoryModal(false);
                       loadPlanDetails();
                    } catch(e) {}
                }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name={inv.form === 'SYRUP' ? 'cup-water' : 'pill'} size={20} color={colors.third} />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>{inv.medication_name}</Text>
                    <Text style={{ fontSize: 13, color: '#888' }}>Skladem: {inv.remaining_qty} {inv.unit}</Text>
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
  safeArea: { flex: 1, backgroundColor: '#FAFAFA' }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 }, headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' }, content: { padding: 20, paddingBottom: 50 }, mainCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3, marginBottom: 30 }, titleRow: { flexDirection: 'row', alignItems: 'center' }, iconBox: { width: 60, height: 60, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 15 }, medName: { fontSize: 24, fontWeight: 'bold', color: '#111' }, medType: { fontSize: 14, color: '#888', marginTop: 4 }, divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 20 }, infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 0 }, label: { fontSize: 11, fontWeight: '800', color: '#AAA', letterSpacing: 1, marginBottom: 5 }, value: { fontSize: 18, fontWeight: '700', color: '#333' }, sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' }, sectionLabel: { fontSize: 12, fontWeight: '800', color: '#AAA', letterSpacing: 1, marginBottom: 10 }, historyDayBlock: { marginBottom: 20 }, historyDateHeader: { fontSize: 13, fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: 10, marginLeft: 5 }, historyLogContainer: { backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F0F0F0' }, historyLogRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8F8F8' }, historyLogLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 }, historyLogTime: { fontSize: 16, fontWeight: 'bold', color: '#333' }, historyLogRight: { flexDirection: 'row', alignItems: 'center', gap: 15 }, historyLogAmount: { fontSize: 14, color: '#666', fontWeight: '600' }, deleteLogBtn: { padding: 6, backgroundColor: '#FFF5F5', borderRadius: 8 }, editLogBtn: { padding: 6, backgroundColor: '#E3F2FD', borderRadius: 8 }, modalOverlayClean: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }, modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingBottom: 30 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#EEE' }, diseaseItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' }, input: { backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, marginTop: 8, fontSize: 16, color: '#333' }, datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, marginTop: 8, gap: 10, justifyContent: 'center' }, datePickerText: { fontSize: 16, color: '#333', fontWeight: '500' }, btnPrim: { padding: 15, borderRadius: 12, backgroundColor: colors.third, marginTop: 10 }, checkPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 19, backgroundColor: '#E8F5E9', gap: 6 }, checkPillText: { fontSize: 14, fontWeight: 'bold', color: colors.third },
  linkCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#F0F0F0' },
  linkCardDisabled: { backgroundColor: '#F8F8F8', borderColor: '#EEE' },
  iconBoxSmall: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  linkCardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  linkCardSub: { fontSize: 13, color: '#888', marginTop: 2 },
  calOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  calContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  calTitle: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  connectionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EEE', marginBottom: 10 },
});