import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import colors from '@/components/colors';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { db } from '../../db';
import { medicationLogs, medicationPlans, inventory, diseases, visits, users } from '../../db/schema';
import { eq, like, and } from 'drizzle-orm';

LocaleConfig.locales['cs'] = {
  monthNames: ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'],
  monthNamesShort: ['Led','Úno','Bře','Dub','Kvě','Čer','Čvc','Srp','Zář','Říj','Lis','Pro'],
  dayNames: ['Neděle','Pondělí','Úterý','Středa','Čtvrtek','Pátek','Sobota'],
  dayNamesShort: ['Ne','Po','Út','St','Čt','Pá','So'],
  today: 'Dnes'
};
LocaleConfig.defaultLocale = 'cs';

const getDatesInRange = (startDate: string, endDate: string) => {
  const dates = [];
  let currentDate = new Date(startDate);
  const end = new Date(endDate);
  while (currentDate <= end) {
    dates.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};

export default function CalendarScreen() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'MEDS' | 'DISEASES' | 'VISITS'>('ALL');
  
  const [dayLogs, setDayLogs] = useState<any[]>([]);
  const [dayDiseases, setDayDiseases] = useState<any[]>([]);
  const [dayVisits, setDayVisits] = useState<any[]>([]);
  const [baseMarkedDates, setBaseMarkedDates] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedDisease, setHighlightedDisease] = useState<any>(null);

  const loadAllMarkedDates = async () => {
    try {
      const storedId = await SecureStore.getItemAsync('activeUserId');
      let currentUserId = storedId ? Number(storedId) : null;
      if (!currentUserId) {
        const allUsers = await db.select().from(users);
        if (allUsers.length > 0) currentUserId = allUsers[0].user_id;
        else return;
      }

      const allLogs = await db.select({ date: medicationLogs.scheduled_date })
        .from(medicationLogs)
        .innerJoin(medicationPlans, eq(medicationLogs.plan_id, medicationPlans.plan_id))
        .where(eq(medicationPlans.user_id, currentUserId));

      const allDiseases = await db.select({ date: diseases.start_date }).from(diseases).where(eq(diseases.user_id, currentUserId));
      const allVisits = await db.select({ date: visits.date }).from(visits).where(eq(visits.user_id, currentUserId));

      const marks: any = {};

      // 1. Uložení všech typyů událostí v daný den
      const addEvent = (dateStr: string, type: 'med' | 'disease' | 'visit') => {
        if (!marks[dateStr]) marks[dateStr] = { events: [] };
        if (!marks[dateStr].events.includes(type)) marks[dateStr].events.push(type);
      };

      allLogs.forEach(l => { if (l.date) addEvent(l.date, 'med'); });
      allDiseases.forEach(d => { if (d.date) addEvent(d.date, 'disease'); });
      allVisits.forEach(v => { if (v.date) addEvent(v.date.split('T')[0], 'visit'); });

      // 2. Vyhodnocení barvy tečky
      Object.keys(marks).forEach(date => {
        const events = marks[date].events;
        let finalDotColor = colors.third; // Výchozí zelená (léky)

        // Pokud je v den více typů událostí, tečka bude Fialová
        if (events.length > 1) {
          finalDotColor = '#9C27B0'; 
        } else if (events[0] === 'visit') {
          finalDotColor = '#2196F3'; // Pouze návštěva = modrá
        } else if (events[0] === 'disease') {
          finalDotColor = '#FF5252'; // Pouze diagnóza = červená
        }

        marks[date] = { marked: true, dotColor: finalDotColor };
      });

      setBaseMarkedDates(marks);
    } catch (e) {}
  };

  const loadDayData = async (dateStr: string) => {
    setIsLoading(true);
    try {
      const storedId = await SecureStore.getItemAsync('activeUserId');
      let currentUserId = storedId ? Number(storedId) : null;
      if (!currentUserId) {
        const allUsers = await db.select().from(users);
        if (allUsers.length > 0) currentUserId = allUsers[0].user_id;
        else return;
      }

      const logs = await db
        .select({
          log_id: medicationLogs.log_id, plan_id: medicationPlans.plan_id, time: medicationLogs.scheduled_time, taken_at: medicationLogs.taken_at, amount: medicationLogs.amount, medName: inventory.medication_name, unit: inventory.unit, form: inventory.form, inventory_id: inventory.inventory_id, remaining_qty: inventory.remaining_qty,
        })
        .from(medicationLogs)
        .innerJoin(medicationPlans, eq(medicationLogs.plan_id, medicationPlans.plan_id))
        .innerJoin(inventory, eq(medicationPlans.inventory_id, inventory.inventory_id))
        .where(and(eq(medicationLogs.scheduled_date, dateStr), eq(medicationPlans.user_id, currentUserId)));

      logs.sort((a, b) => {
        const timeA = a.time || (a.taken_at ? new Date(a.taken_at as string).toTimeString() : '');
        const timeB = b.time || (b.taken_at ? new Date(b.taken_at as string).toTimeString() : '');
        return timeA.localeCompare(timeB);
      });
      setDayLogs(logs);

      const dis = await db.select().from(diseases).where(and(eq(diseases.start_date, dateStr), eq(diseases.user_id, currentUserId)));
      setDayDiseases(dis);

      const vis = await db.select().from(visits).where(and(like(visits.date, `${dateStr}%`), eq(visits.user_id, currentUserId)));
      setDayVisits(vis);
    } catch (error) {} finally { setIsLoading(false); }
  };

  useFocusEffect(
    useCallback(() => {
      loadAllMarkedDates();
      loadDayData(selectedDate);
      setHighlightedDisease(null); 
    }, [selectedDate])
  );

  const handleRemoveLog = (logId: number, amountToReturn: number, invId: number, currentRemaining: number) => {
    Alert.alert(
      "Zrušit užití léku", "Opravdu chceš tento záznam smazat? Lék se vrátí zpět do Tvé lékárničky.",
      [
        { text: "Zrušit", style: "cancel" },
        { text: "Smazat a vrátit", style: "destructive", onPress: async () => {
            try {
              await db.delete(medicationLogs).where(eq(medicationLogs.log_id, logId));
              await db.update(inventory).set({ remaining_qty: currentRemaining + amountToReturn }).where(eq(inventory.inventory_id, invId));
              loadDayData(selectedDate); loadAllMarkedDates();
            } catch (e) { Alert.alert("Chyba", "Nepodařilo se záznam smazat."); }
          }
        }
      ]
    );
  };

  let finalMarkedDates = { ...baseMarkedDates };

  if (highlightedDisease) {
    const start = highlightedDisease.start_date;
    const end = highlightedDisease.end_date || new Date().toISOString().split('T')[0]; 
    const range = getDatesInRange(start, end);
    range.forEach((date, index) => {
      const isStart = index === 0;
      const isEnd = index === range.length - 1;
      finalMarkedDates[date] = { ...finalMarkedDates[date], color: '#FFEBEB', textColor: '#FF5252', startingDay: isStart, endingDay: isEnd };
    });
  }

  finalMarkedDates[selectedDate] = { 
    ...finalMarkedDates[selectedDate], 
    selected: true, 
    color: colors.third,
    textColor: '#FFF',
    startingDay: true,
    endingDay: true
  };

  const hasAnyData = dayLogs.length > 0 || dayDiseases.length > 0 || dayVisits.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}><Text style={styles.title}>Časová osa</Text></View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <View style={styles.calendarWrapper}>
          <Calendar
            markingType={'period'} 
            current={selectedDate}
            onDayPress={(day: any) => setSelectedDate(day.dateString)}
            markedDates={finalMarkedDates}
            theme={{
              backgroundColor: '#FFF', calendarBackground: '#FFF', textSectionTitleColor: '#b6c1cd', selectedDayBackgroundColor: colors.third, selectedDayTextColor: '#ffffff', todayTextColor: colors.third, dayTextColor: '#2d4150', textDisabledColor: '#d9e1e8', arrowColor: colors.third, monthTextColor: '#111', textMonthFontWeight: 'bold',
            }}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
          <TouchableOpacity style={[styles.filterBtn, activeFilter === 'ALL' && styles.filterActive]} onPress={() => setActiveFilter('ALL')}><Text style={[styles.filterText, activeFilter === 'ALL' && styles.filterTextActive]}>Vše</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.filterBtn, activeFilter === 'MEDS' && styles.filterActive]} onPress={() => setActiveFilter('MEDS')}><Text style={[styles.filterText, activeFilter === 'MEDS' && styles.filterTextActive]}>💊 Léky</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.filterBtn, activeFilter === 'DISEASES' && styles.filterActive]} onPress={() => setActiveFilter('DISEASES')}><Text style={[styles.filterText, activeFilter === 'DISEASES' && styles.filterTextActive]}>🤒 Diagnózy</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.filterBtn, activeFilter === 'VISITS' && styles.filterActive]} onPress={() => setActiveFilter('VISITS')}><Text style={[styles.filterText, activeFilter === 'VISITS' && styles.filterTextActive]}>🩺 Návštěvy</Text></TouchableOpacity>
        </ScrollView>

        <View style={styles.recordsContainer}>
          <Text style={styles.dateLabel}>Záznamy pro: {new Date(selectedDate).toLocaleDateString('cs-CZ')}</Text>
          {isLoading ? ( <ActivityIndicator size="large" color={colors.third} style={{ marginTop: 30 }} /> ) : !hasAnyData ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="calendar-blank" size={48} color="#E0E0E0" />
              <Text style={styles.emptyText}>Žádné záznamy pro tento den.</Text>
            </View>
          ) : (
            <View style={styles.cardsContainer}>
              {(activeFilter === 'ALL' || activeFilter === 'MEDS') && dayLogs.length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionHeader}>LÉKY</Text>
                  <View style={styles.historyLogContainer}>
                    {dayLogs.map((log, index) => (
                      <View key={index} style={styles.historyLogRow}>
                        <TouchableOpacity style={styles.historyLogLeft} activeOpacity={0.6} onPress={() => router.push({ pathname: '/medication-detail', params: { id: log.plan_id } })}>
                          <View style={[styles.iconBox, { backgroundColor: '#E8F5E9' }]}><MaterialCommunityIcons name={log.form === 'SYRUP' ? 'medication-outline' : 'pill-multiple'} size={22} color={colors.fourth} /></View>
                          <View><Text style={styles.historyLogName}>{log.medName}</Text><Text style={styles.historyLogTime}>{log.time || (log.taken_at ? new Date(log.taken_at as string).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : '')}</Text></View>
                        </TouchableOpacity>
                        <View style={styles.historyLogRight}>
                          <Text style={styles.historyLogAmount}>{log.amount} {log.unit}</Text>
                          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleRemoveLog(log.log_id, log.amount, log.inventory_id, log.remaining_qty)}>
                            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#FF5252" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {(activeFilter === 'ALL' || activeFilter === 'DISEASES') && dayDiseases.length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionHeader}>POČÁTEK DIAGNÓZY</Text>
                  {dayDiseases.map((disease, index) => {
                    const isHighlighted = highlightedDisease?.disease_id === disease.disease_id;
                    return (
                      <View key={index} style={[styles.diseaseCardContainer, isHighlighted && { borderColor: '#FF5252', borderWidth: 1.5 }]}>
                        <TouchableOpacity style={styles.diseaseCardLeft} activeOpacity={0.6} onPress={() => setHighlightedDisease(isHighlighted ? null : disease)}>
                          <MaterialCommunityIcons name="thermometer" size={24} color="#FF5252" />
                          <View style={{ marginLeft: 12 }}>
                            <Text style={styles.cardTitle}>{disease.disease_name}</Text>
                            <Text style={styles.cardHint}>{isHighlighted ? 'Skrýt v kalendáři' : 'Zobrazit v kalendáři'}</Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.diseaseDetailBtn} activeOpacity={0.6} onPress={() => router.push({ pathname: '/disease-detail', params: { id: disease.disease_id } })}>
                          <Text style={styles.diseaseDetailText}>Detail</Text>
                          <MaterialCommunityIcons name="chevron-right" size={18} color="#FF5252" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {(activeFilter === 'ALL' || activeFilter === 'VISITS') && dayVisits.length > 0 && (
                <View style={styles.sectionBlock}>
                  <Text style={styles.sectionHeader}>NÁVŠTĚVY U LÉKAŘE</Text>
                  {dayVisits.map((visit, index) => (
                    <TouchableOpacity key={index} style={styles.visitCard} activeOpacity={0.7} onPress={() => router.push({ pathname: '/visit-detail', params: { id: visit.visit_id } })}>
                      <MaterialCommunityIcons name="stethoscope" size={24} color="#2196F3" />
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={styles.cardTitle}>{visit.doctor || 'Lékař'}</Text>
                        <Text style={styles.cardSub}>{visit.department || 'Neuvedeno'} {visit.hospital ? `• ${visit.hospital}` : ''}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#CCC" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFA' }, header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 }, title: { fontSize: 32, fontWeight: 'bold', color: '#111' }, calendarWrapper: { backgroundColor: '#FFF', marginHorizontal: 20, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 }, filterContainer: { marginTop: 20, marginBottom: 10 }, filterBtn: { backgroundColor: '#EEE', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 }, filterActive: { backgroundColor: '#333' }, filterText: { fontWeight: 'bold', color: '#666' }, filterTextActive: { color: '#FFF' }, recordsContainer: { padding: 20 }, dateLabel: { fontSize: 16, fontWeight: 'bold', color: '#111', marginBottom: 15 }, emptyState: { alignItems: 'center', marginTop: 30, padding: 30, backgroundColor: '#FFF', borderRadius: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: '#EEE' }, emptyText: { color: '#AAA', marginTop: 10, textAlign: 'center' }, cardsContainer: { gap: 20 }, sectionBlock: { marginBottom: 10 }, sectionHeader: { fontSize: 12, fontWeight: '800', color: '#AAA', marginBottom: 8, letterSpacing: 1 }, historyLogContainer: { backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F0F0F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 }, historyLogRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F8F8F8' }, historyLogLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }, iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, historyLogName: { fontSize: 16, fontWeight: 'bold', color: '#333' }, historyLogTime: { fontSize: 13, color: '#888', marginTop: 2 }, historyLogRight: { flexDirection: 'row', alignItems: 'center', gap: 10 }, historyLogAmount: { fontSize: 14, color: '#666', fontWeight: '600' }, deleteBtn: { padding: 6, backgroundColor: '#FFF5F5', borderRadius: 8 }, visitCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E3F2FD' }, diseaseCardContainer: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#FFEBEB', overflow: 'hidden' }, diseaseCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16 }, cardHint: { fontSize: 11, color: '#FF5252', marginTop: 2, fontWeight: '600' }, diseaseDetailBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF5F5', paddingHorizontal: 16, justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: '#FFEBEB' }, diseaseDetailText: { fontSize: 14, fontWeight: 'bold', color: '#FF5252', marginRight: 4 }, cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' }, cardSub: { fontSize: 13, color: '#666', marginTop: 2 },
});