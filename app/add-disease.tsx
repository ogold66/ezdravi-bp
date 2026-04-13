import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, TouchableOpacity, Alert, ScrollView, Keyboard } from 'react-native';
import { useRouter, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CalendarPicker from '@/components/CalendarPicker';
import colors from '@/components/colors';
import { db } from '../db';
import { diseases, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as SecureStore from 'expo-secure-store';

const getSafeDate = (val: any): Date => {
  if (!val || val === 'null' || val === '') return new Date();
  const d = new Date(val);
  if (isNaN(d.getTime()) || d.getFullYear() < 1990) return new Date();
  return d;
};

const getLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

// Bezpečné parsování z YYYY-MM-DD stringu bez UTC posunu
const dateFromStr = (s: string): Date => {
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
};

export default function AddDiseaseScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const isEditMode = !!id;
  const diseaseId = Number(id);

  const [userId, setUserId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'ACUTE' | 'CHRONIC'>('ACUTE');
  const [note, setNote] = useState('');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [isStartPickerVisible, setStartPickerVisible] = useState(false);
  const [isEndPickerVisible, setEndPickerVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const fetchUserAndData = async () => {
        const storedId = await SecureStore.getItemAsync('activeUserId');
        if (storedId) {
          setUserId(Number(storedId));
        } else {
          const usersList = await db.select().from(users);
          if (usersList.length > 0) setUserId(usersList[0].user_id);
        }
        if (isEditMode) {
          try {
            const data = await db.select().from(diseases).where(eq(diseases.disease_id, diseaseId));
            if (data.length > 0) {
              const item = data[0];
              setName(item.disease_name);
              setType(item.type as 'ACUTE' | 'CHRONIC');
              setNote(item.note || '');
              setStartDate(getSafeDate(item.start_date));
              setEndDate(item.end_date ? getSafeDate(item.end_date) : null);
            }
          } catch (e) {}
        }
      };
      fetchUserAndData();
    }, [isEditMode, diseaseId])
  );

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Chyba', 'Zadej prosím název diagnózy (např. Angína).');
    const payload = {
      user_id: userId, disease_name: name.trim(), type,
      note: note.trim() || null,
      start_date: getLocalDateStr(startDate),
      end_date: endDate ? getLocalDateStr(endDate) : null,
    };
    try {
      if (isEditMode) {
        await db.update(diseases).set(payload).where(eq(diseases.disease_id, diseaseId));
        router.back();
      } else {
        const result = await db.insert(diseases).values(payload).returning({ insertedId: diseases.disease_id });
        router.replace({ pathname: '/disease-detail', params: { id: result[0].insertedId } });
      }
    } catch (e) { Alert.alert('Chyba', 'Nepodařilo se uložit diagnózu.'); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ zIndex: 10 }}>
          <MaterialCommunityIcons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: 1 }]}>
          {isEditMode ? 'Úprava Diagnózy' : 'Nová Diagnóza'}
        </Text>
        <TouchableOpacity onPress={handleSave} style={{ zIndex: 10 }}>
          <MaterialCommunityIcons name="check" size={28} color={colors.third} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <Text style={styles.label}>NÁZEV DIAGNÓZY</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Např. Angína, Zlomená ruka..." />

        <Text style={[styles.label, { marginTop: 20 }]}>TYP (Jak dlouho to potrvá?)</Text>
        <View style={styles.toggleContainer}>
          <TouchableOpacity style={[styles.toggleBtn, type === 'ACUTE' && styles.activeToggle]} onPress={() => setType('ACUTE')}>
            <Text style={[styles.toggleBtnText, type === 'ACUTE' && { color: '#FF5252', fontWeight: 'bold' }]}>Akutní (Krátkodobé)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, type === 'CHRONIC' && styles.activeToggle]} onPress={() => setType('CHRONIC')}>
            <Text style={[styles.toggleBtnText, type === 'CHRONIC' && { color: '#2196F3', fontWeight: 'bold' }]}>Chronické (Dlouhodobé)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rowDates}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { marginTop: 20 }]}>POČÁTEK</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => { Keyboard.dismiss(); setStartPickerVisible(true); }}>
              <MaterialCommunityIcons name="calendar" size={20} color={colors.third} />
              <Text style={[styles.datePickerText, { color: '#111', fontWeight: 'bold' }]}>{startDate.toLocaleDateString('cs-CZ')}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ width: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { marginTop: 20 }]}>KONEC (Uzdravení)</Text>
            <TouchableOpacity 
              style={[styles.datePickerBtn, { justifyContent: 'space-between', paddingRight: endDate ? 10 : 15 }]} 
              onPress={() => { Keyboard.dismiss(); setEndPickerVisible(true); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialCommunityIcons name="calendar-check" size={20} color={endDate ? '#FF5252' : '#AAA'} />
                <Text style={[styles.datePickerText, endDate ? { color: '#FF5252', fontWeight: 'bold' } : {}]}>
                  {endDate ? endDate.toLocaleDateString('cs-CZ') : 'Probíhá'}
                </Text>
              </View>
              {endDate && (
                <TouchableOpacity onPress={(e) => { e.stopPropagation(); setEndDate(null); }} style={{ padding: 4 }}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#FF5252" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.label, { marginTop: 20 }]}>POZNÁMKA LÉKAŘE / TVOJE</Text>
        <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} placeholder="Doporučen klid na lůžku..." multiline />

        <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
          <Text style={styles.primaryBtnText}>{isEditMode ? 'Uložit úpravy' : 'Uložit a otevřít detail'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <CalendarPicker
        visible={isStartPickerVisible}
        title="Datum počátku"
        currentDate={getLocalDateStr(startDate)}
        markedDates={{ [getLocalDateStr(startDate)]: { selected: true, selectedColor: colors.third } }}
        onDayPress={(day) => {
          const d = dateFromStr(day.dateString);
          setStartDate(d);
          if (endDate && endDate < d) setEndDate(d);
          setStartPickerVisible(false);
        }}
        onClose={() => setStartPickerVisible(false)}
        themeColor={colors.third}
      />

      <CalendarPicker
        visible={isEndPickerVisible}
        title="Datum uzdravení"
        currentDate={getLocalDateStr(endDate || startDate)}
        markedDates={endDate ? { [getLocalDateStr(endDate)]: { selected: true, selectedColor: '#FF5252' } } : {}}
        onDayPress={(day) => {
          const d = dateFromStr(day.dateString);
          setEndDate(d < startDate ? startDate : d);
          setEndPickerVisible(false);
        }}
        onClose={() => setEndPickerVisible(false)}
        minDate={getLocalDateStr(startDate)}
        themeColor="#FF5252"
        deleteLabel="Smazat"
        onDelete={() => setEndDate(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  label: { fontSize: 11, fontWeight: 'bold', color: '#AAA', letterSpacing: 1 },
  input: { backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, marginTop: 8, fontSize: 16, color: '#333' },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#F8F8F8', borderRadius: 12, padding: 4, marginTop: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeToggle: { backgroundColor: '#FFF', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  toggleBtnText: { color: '#888', fontSize: 14 },
  rowDates: { flexDirection: 'row', justifyContent: 'space-between' },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, marginTop: 8 },
  datePickerText: { fontSize: 16, color: '#666' },
  primaryBtn: { backgroundColor: colors.third, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 30 },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});