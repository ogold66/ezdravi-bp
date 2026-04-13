import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, TouchableOpacity, Alert, ScrollView, Keyboard, Modal } from 'react-native';
import { useRouter, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CalendarPicker from '@/components/CalendarPicker';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import colors from '@/components/colors';
import { db } from '../db';
import { medicationPlans, users, diseases, inventory } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as SecureStore from 'expo-secure-store';

const DAYS = [{ id: '1', label: 'Po' }, { id: '2', label: 'Út' }, { id: '3', label: 'St' }, { id: '4', label: 'Čt' }, { id: '5', label: 'Pá' }, { id: '6', label: 'So' }, { id: '7', label: 'Ne' }];
interface Dose { time: string; amount: number; }
interface Schedule { days: string[]; doses: Dose[]; }

const getSafeDate = (val: any): Date => {
  if (!val || val === 'null' || val === '') return new Date();
  const d = new Date(val);
  return isNaN(d.getTime()) || d.getFullYear() < 1990 ? new Date() : d;
};

const getLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

const dateFromStr = (s: string): Date => {
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
};

export default function AddMedicationScreen() {
  const router = useRouter();
  const { id, preselected_disease_id, preselected_inventory_id } = useLocalSearchParams();
  const isEditMode = !!id;
  const planId = Number(id);

  const [userId, setUserId] = useState<number | null>(null);
  const [allInventory, setAllInventory] = useState<any[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState<number | null>(null);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [allDiseases, setAllDiseases] = useState<any[]>([]);
  const [selectedDiseaseId, setSelectedDiseaseId] = useState<number | null>(null);
  const [showDiseaseModal, setShowDiseaseModal] = useState(false);

  const [isSos, setIsSos] = useState(false);
  const [intervalHint, setIntervalHint] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([{ days: ['1','2','3','4','5','6','7'], doses: [] }]);
  const [activeScheduleIdx, setActiveScheduleIdx] = useState<number | null>(null);

  const [showAmountPicker, setShowAmountPicker] = useState(false);
  const [tempAmount, setTempAmount] = useState('1');
  const [tempTime, setTempTime] = useState<Date>(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; });

  // Kalendáře pro datum (čistý JS)
  const [isStartPickerVisible, setStartPickerVisible] = useState(false);
  const [isEndPickerVisible, setEndPickerVisible] = useState(false);
  // Nativní spinner jen pro čas
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const fetchUserAndData = async () => {
        const storedId = await SecureStore.getItemAsync('activeUserId');
        if (storedId) {
          setUserId(Number(storedId));
        } else {
          // Záloha pro jistotu
          const usersList = await db.select().from(users);
          if (usersList.length > 0) setUserId(usersList[0].user_id);
        }
        try {
          const diseasesList = await db.select().from(diseases);
          setAllDiseases(diseasesList);
          if (!isEditMode && preselected_disease_id) {
            const pd = diseasesList.find(d => d.disease_id === Number(preselected_disease_id));
            if (pd && pd.start_date) setStartDate(getSafeDate(pd.start_date));
            if (pd && pd.end_date) setEndDate(getSafeDate(pd.end_date));
          }
          const inventoryList = await db.select().from(inventory).where(eq(inventory.status, 'ACTIVE'));
          setAllInventory(inventoryList);
          if (preselected_disease_id) setSelectedDiseaseId(Number(preselected_disease_id));
          if (preselected_inventory_id) setSelectedInventoryId(Number(preselected_inventory_id));
        } catch (e) {}
        if (isEditMode) {
          try {
            const medData = await db.select().from(medicationPlans).where(eq(medicationPlans.plan_id, planId));
            if (medData.length > 0) {
              const m = medData[0];
              setSelectedInventoryId(m.inventory_id);
              setIsSos(m.is_sos || false);
              setIntervalHint(m.interval_hint || '');
              if (!preselected_disease_id) setSelectedDiseaseId(m.disease_id);
              setStartDate(getSafeDate(m.start_date));
              if (m.end_date) setEndDate(getSafeDate(m.end_date));
              if (!m.is_sos && m.doses_config) { try { const parsed = JSON.parse(m.doses_config); if (parsed && parsed.length > 0) setSchedules(parsed); } catch (e) {} }
            }
          } catch (e) {}
        }
      };
      fetchUserAndData();
    }, [isEditMode, planId, preselected_disease_id, preselected_inventory_id])
  );

  const handleConfirmTime = (date: Date) => {
    setTempTime(date);
    setTimePickerVisible(false);
    setTimeout(() => setShowAmountPicker(true), 400);
  };

  const toggleDay = (scheduleIdx: number, dayId: string) => {
    const ns = [...schedules];
    const cd = ns[scheduleIdx].days;
    ns[scheduleIdx].days = cd.includes(dayId) ? cd.filter(d => d !== dayId) : [...cd, dayId];
    setSchedules(ns);
  };

  const saveDose = () => {
    if (activeScheduleIdx === null) return;
    const timeStr = `${tempTime.getHours().toString().padStart(2, '0')}:${tempTime.getMinutes().toString().padStart(2, '0')}`;
    const amount = parseFloat(tempAmount.replace(',', '.')) || 1;
    const ns = [...schedules];
    ns[activeScheduleIdx].doses.push({ time: timeStr, amount });
    ns[activeScheduleIdx].doses.sort((a, b) => a.time.localeCompare(b.time));
    setSchedules(ns);
    setShowAmountPicker(false);
    setTempAmount('1');
  };

  const handleSave = async () => {
    if (!selectedInventoryId) return Alert.alert('Chyba', 'Musíš vybrat lék z Lékárničky.');
    if (!isSos && schedules.every(s => s.doses.length === 0)) return Alert.alert('Chyba', 'Přidej aspoň jeden čas nebo vyber SOS lék.');
    const payload = {
      inventory_id: selectedInventoryId, disease_id: selectedDiseaseId,
      is_sos: isSos, interval_hint: isSos ? intervalHint.trim() : null,
      doses_config: isSos ? JSON.stringify([]) : JSON.stringify(schedules),
      start_date: getLocalDateStr(startDate),
      end_date: endDate ? getLocalDateStr(endDate) : null,
    };
    try {
      if (isEditMode) await db.update(medicationPlans).set(payload).where(eq(medicationPlans.plan_id, planId));
      else await db.insert(medicationPlans).values({ user_id: userId, ...payload, created_at: new Date().toISOString() });
      router.back();
    } catch (e) { Alert.alert('Chyba', 'Ukládání selhalo.'); }
  };

  const getSelectedDiseaseName = () => {
    if (!selectedDiseaseId) return 'Nevybráno (Preventivní)';
    const d = allDiseases.find(d => d.disease_id === selectedDiseaseId);
    return d ? `${d.disease_name} (${new Date(d.start_date).toLocaleDateString('cs-CZ')})` : 'Neznámá diagnóza';
  };
  const getSelectedInventoryName = () => {
    if (!selectedInventoryId) return 'Vybrat krabičku z Lékárničky';
    const i = allInventory.find(i => i.inventory_id === selectedInventoryId);
    return i ? `${i.medication_name} (${i.remaining_qty} ${i.unit} zbývá)` : 'Neznámý lék';
  };
  const currentUnit = allInventory.find(i => i.inventory_id === selectedInventoryId)?.unit || 'ks';

  // Omezení datumů medikace na rozsah vybrané diagnózy
  const getDiseaseBounds = (): { minDate: string; maxDate: string } => {
    const DEFAULT_MIN = '1990-01-01';
    const DEFAULT_MAX = '2100-12-31';
    if (!selectedDiseaseId) return { minDate: DEFAULT_MIN, maxDate: DEFAULT_MAX };
    const d = allDiseases.find(x => x.disease_id === selectedDiseaseId);
    if (!d) return { minDate: DEFAULT_MIN, maxDate: DEFAULT_MAX };
    return {
      minDate: d.start_date ? getLocalDateStr(getSafeDate(d.start_date)) : DEFAULT_MIN,
      maxDate: d.end_date ? getLocalDateStr(getSafeDate(d.end_date)) : DEFAULT_MAX,
    };
  };
  const bounds = getDiseaseBounds();

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ zIndex: 10 }}>
          <MaterialCommunityIcons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: 1 }]}>
          {isEditMode ? 'Úprava Medikace' : 'Nová Medikace'}
        </Text>
        <TouchableOpacity onPress={handleSave} style={{ zIndex: 10 }}>
          <MaterialCommunityIcons name="check" size={28} color={colors.third} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 150 }}>
        <Text style={styles.label}>KTERÝ LÉK Z LÉKÁRNIČKY?</Text>
        <TouchableOpacity
          style={[styles.dropdownBtn, preselected_inventory_id ? { backgroundColor: '#F0F0F0', opacity: 0.8 } : {}]}
          onPress={() => { Keyboard.dismiss(); setShowInventoryModal(true); }}
          disabled={!!preselected_inventory_id}
        >
          <Text style={{ fontSize: 16, color: selectedInventoryId ? '#333' : '#888' }}>{getSelectedInventoryName()}</Text>
          {preselected_inventory_id 
            ? <MaterialCommunityIcons name="lock" size={20} color="#AAA" />
            : <MaterialCommunityIcons name="chevron-down" size={24} color="#888" />}
        </TouchableOpacity>

        <Text style={[styles.label, { marginTop: 20 }]}>PRO JAKOU DIAGNÓZU JE URČEN?</Text>
        <TouchableOpacity
          style={[styles.dropdownBtn, preselected_disease_id ? { backgroundColor: '#F0F0F0', opacity: 0.8 } : {}]}
          onPress={() => { Keyboard.dismiss(); setShowDiseaseModal(true); }}
          disabled={!!preselected_disease_id}
        >
          <Text style={{ fontSize: 16, color: selectedDiseaseId ? '#333' : '#888' }}>{getSelectedDiseaseName()}</Text>
          {preselected_disease_id 
            ? <MaterialCommunityIcons name="lock" size={20} color="#AAA" />
            : <MaterialCommunityIcons name="chevron-down" size={24} color="#888" />}
        </TouchableOpacity>

        <View style={styles.divider} />
        <Text style={styles.label}>TYP DÁVKOVÁNÍ</Text>
        <View style={styles.unitToggle}>
          <TouchableOpacity onPress={() => setIsSos(false)} style={[styles.unitBtn, !isSos && styles.activeUnit]}>
            <Text style={[!isSos && { color: colors.third, fontWeight: 'bold' }]}>Pravidelně</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsSos(true)} style={[styles.unitBtn, isSos && styles.activeUnit]}>
            <Text style={[isSos && { color: '#FF5252', fontWeight: 'bold' }]}>Podle potřeby (SOS)</Text>
          </TouchableOpacity>
        </View>

        {isSos && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.label}>INSTRUKCE / INTERVAL</Text>
            <TextInput style={styles.input} value={intervalHint} onChangeText={setIntervalHint} placeholder="Např. při horečce, max po 6 hodinách" />
          </View>
        )}

        {!isSos && schedules.map((sched, sIdx) => (
          <View key={sIdx} style={styles.scheduleCard}>
            <View style={styles.scheduleHeader}>
              <Text style={styles.scheduleTitle}>MEDIKACE {sIdx + 1}</Text>
              {schedules.length > 1 && (
                <TouchableOpacity onPress={() => setSchedules(schedules.filter((_, i) => i !== sIdx))}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color="#FF5252" />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.daysRow}>
              {DAYS.map((d) => {
                const isSelected = sched.days.includes(d.id);
                // LOGIKA: Zjistíme, jestli je tento den už vybraný v NĚJAKÉM JINÉM režimu (mimo tento aktuální sIdx)
                const isDisabled = schedules.some((otherSched, otherIdx) => otherIdx !== sIdx && otherSched.days.includes(d.id));

                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[
                      styles.dayCircle,
                      isSelected ? styles.dayCircleActive : styles.dayCircleInactive,
                      isDisabled && { backgroundColor: '#F0F0F0', borderColor: '#F0F0F0', opacity: 0.5 } // Zašednutí pro zablokované dny
                    ]}
                    disabled={isDisabled}
                    onPress={() => toggleDay(sIdx, d.id)}
                  >
                    <Text style={[
                      styles.dayText,
                      isSelected && styles.dayTextActive,
                      isDisabled && { color: '#CCC' } // Barva textu zablokovaného dne
                    ]}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.dosesList}>
              {sched.doses.map((dose, dIdx) => (
                <View key={dIdx} style={styles.doseItem}>
                  <Text style={{ fontWeight: 'bold' }}>{dose.time}</Text>
                  <Text>{dose.amount} {currentUnit}</Text>
                  <TouchableOpacity onPress={() => { const ns = [...schedules]; ns[sIdx].doses = ns[sIdx].doses.filter((_, i) => i !== dIdx); setSchedules(ns); }}>
                    <MaterialCommunityIcons name="close" size={18} color="#AAA" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addDoseInline} onPress={() => { Keyboard.dismiss(); setActiveScheduleIdx(sIdx); setTimePickerVisible(true); }}>
                <MaterialCommunityIcons name="plus" size={16} color={colors.third} />
                <Text style={{ color: colors.third, fontWeight: 'bold' }}>Přidat čas</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {!isSos && (
          <TouchableOpacity style={styles.addScheduleBtn} onPress={() => setSchedules([...schedules, { days: [], doses: [] }])}>
            <MaterialCommunityIcons name="calendar-plus" size={20} color="#666" />
            <Text style={styles.addScheduleText}>PŘIDAT DALŠÍ ČASY</Text>
          </TouchableOpacity>
        )}

        <View style={styles.divider} />
        <Text style={styles.label}>DOBA UŽÍVÁNÍ</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => { Keyboard.dismiss(); setStartPickerVisible(true); }}>
            <Text style={{ fontSize: 12, color: '#888' }}>Od:</Text>
            <Text style={{ fontSize: 16 }}>{startDate.toLocaleDateString('cs-CZ')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => { Keyboard.dismiss(); setEndPickerVisible(true); }}>
            <Text style={{ fontSize: 12, color: '#888' }}>Do:</Text>
            <Text style={{ fontSize: 16 }}>{endDate ? endDate.toLocaleDateString('cs-CZ') : 'Neurčeno'}</Text>
            {endDate && (
              <TouchableOpacity onPress={() => setEndDate(null)} style={{ position: 'absolute', right: 10, top: 15, padding: 5 }}>
                <MaterialCommunityIcons name="close-circle" size={20} color="#FF5252" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CalendarPicker
        visible={isStartPickerVisible}
        title="Datum začátku"
        currentDate={getLocalDateStr(startDate)}
        markedDates={{ [getLocalDateStr(startDate)]: { selected: true, selectedColor: colors.third } }}
        onDayPress={(day) => {
          const d = dateFromStr(day.dateString);
          setStartDate(d);
          if (endDate && endDate < d) setEndDate(d);
          setStartPickerVisible(false);
        }}
        onClose={() => setStartPickerVisible(false)}
        minDate={bounds.minDate}
        maxDate={bounds.maxDate}
        themeColor={colors.third}
      />

      <CalendarPicker
        visible={isEndPickerVisible}
        title="Datum konce"
        currentDate={getLocalDateStr(endDate || startDate)}
        markedDates={endDate ? { [getLocalDateStr(endDate)]: { selected: true, selectedColor: colors.third } } : {}}
        onDayPress={(day) => {
          const d = dateFromStr(day.dateString);
          setEndDate(d < startDate ? startDate : d);
          setEndPickerVisible(false);
        }}
        onClose={() => setEndPickerVisible(false)}
        minDate={getLocalDateStr(startDate)}
        maxDate={bounds.maxDate}
        themeColor={colors.third}
        deleteLabel={endDate ? 'Smazat' : undefined}
        onDelete={() => setEndDate(null)}
      />

      {/* ČAS – nativní spinner (nezanechá nativní stav, neovlivní ostatní pickery) */}
      <DateTimePickerModal
        isVisible={isTimePickerVisible}
        mode="time"
        date={new Date(tempTime)}
        onConfirm={handleConfirmTime}
        onCancel={() => setTimePickerVisible(false)}
        locale="cs-CZ"
        display="spinner"
        themeVariant="light"
        buttonTextColorIOS={colors.third}
        confirmTextIOS="Potvrdit"
        cancelTextIOS="Zrušit"
        is24Hour
        pickerContainerStyleIOS={{ alignItems: 'center' }}
      />

      {/* MODAL – množství */}
      <Modal transparent visible={showAmountPicker} animationType="fade" onRequestClose={() => setShowAmountPicker(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.amountCard}>
            <Text style={styles.amountTitle}>
              Čas: {`${tempTime.getHours().toString().padStart(2, '0')}:${tempTime.getMinutes().toString().padStart(2, '0')}`} – Kolik?
            </Text>
            <TextInput style={styles.amountInput} keyboardType="decimal-pad" autoFocus value={tempAmount} onChangeText={setTempAmount} selectTextOnFocus />
            <View style={styles.amountActions}>
              <TouchableOpacity onPress={() => setShowAmountPicker(false)} style={styles.btnSec}><Text>Zpět</Text></TouchableOpacity>
              <TouchableOpacity onPress={saveDose} style={styles.btnPrim}><Text style={{ color: '#FFF', fontWeight: 'bold' }}>Uložit</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL – výběr lékárničky */}
      <Modal visible={showInventoryModal} animationType="fade" transparent onRequestClose={() => setShowInventoryModal(false)}>
        <TouchableOpacity style={styles.calOverlay} activeOpacity={1} onPress={() => setShowInventoryModal(false)}>
          <View style={styles.calContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.calHeader}>
              <Text style={styles.calTitle}>Lékárnička</Text>
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
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.third }}>Přidat novou krabičku</Text>
                </View>
              </TouchableOpacity>

              {allInventory.map(inv => (
                <TouchableOpacity key={inv.inventory_id} style={styles.connectionCard} onPress={() => { setSelectedInventoryId(inv.inventory_id); setShowInventoryModal(false); }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name={inv.form === 'SYRUP' ? 'medication' : 'pill'} size={20} color={colors.third} />
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

      {/* MODAL – výběr diagnózy */}
      <Modal visible={showDiseaseModal} animationType="fade" transparent onRequestClose={() => setShowDiseaseModal(false)}>
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

              <TouchableOpacity style={styles.connectionCard} onPress={() => { setSelectedDiseaseId(null); setShowDiseaseModal(false); }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="shield-check-outline" size={20} color="#AAA" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#666' }}>Nevybráno</Text>
                  <Text style={{ fontSize: 13, color: '#888' }}>Preventivní užívání</Text>
                </View>
              </TouchableOpacity>

              {allDiseases
                .sort((a, b) => {
                  // Aktivní diagnózy nahoře, historické dole, v rámci skupiny seřadit od nejnovější
                  if (!a.end_date && b.end_date) return -1;
                  if (a.end_date && !b.end_date) return 1;
                  return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
                })
                .map(disease => {
                  const isEnded = disease.end_date !== null;
                  return (
                    <TouchableOpacity key={disease.disease_id} style={styles.connectionCard} onPress={() => { setSelectedDiseaseId(disease.disease_id); setShowDiseaseModal(false); }}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  label: { fontSize: 11, fontWeight: 'bold', color: '#AAA', letterSpacing: 1 },
  dayCircleActive: { backgroundColor: colors.third, borderColor: colors.third },
  dayCircleInactive: { backgroundColor: '#FFF' },
  dayText: { fontSize: 13, fontWeight: 'bold', color: '#AAA' },
  dayTextActive: { color: '#FFF' },
  input: { backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, marginTop: 8, fontSize: 16, color: '#333', justifyContent: 'center' },
  dropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, marginTop: 8 },
  unitToggle: { flexDirection: 'row', backgroundColor: '#F8F8F8', borderRadius: 12, padding: 4, marginTop: 8 },
  unitBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeUnit: { backgroundColor: '#FFF', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  divider: { height: 1, backgroundColor: '#F2F2F2', marginVertical: 25 },
  scheduleCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: '#EEE', marginTop: 15 },
  scheduleHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  scheduleTitle: { fontSize: 12, fontWeight: '800', color: colors.third },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 15 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
  activeDay: { backgroundColor: colors.third },
  dosesList: { borderTopWidth: 1, borderTopColor: '#F8F8F8', paddingTop: 10 },
  doseItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8F8F8' },
  addDoseInline: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 15 },
  addScheduleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: '#CCC', borderRadius: 15 },
  addScheduleText: { fontSize: 12, fontWeight: 'bold', color: '#666' },
  modalOverlayCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  amountCard: { width: 280, backgroundColor: '#FFF', borderRadius: 25, padding: 25, alignItems: 'center' },
  amountTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  amountInput: { width: '100%', backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, textAlign: 'center', fontSize: 24, fontWeight: 'bold' },
  amountActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnSec: { padding: 12, borderRadius: 10, backgroundColor: '#EEE' },
  btnPrim: { padding: 12, borderRadius: 10, backgroundColor: colors.third },
  diseaseItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  calOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  calContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  calTitle: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  connectionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EEE', marginBottom: 10 },
});