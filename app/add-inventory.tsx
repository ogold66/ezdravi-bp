import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, Keyboard } from 'react-native';
import { useRouter, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CalendarPicker from '@/components/CalendarPicker';
import colors from '@/components/colors';
import { db } from '../db';
import { inventory, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as SecureStore from 'expo-secure-store';

const getSafeDate = (val: any): Date | null => {
  if (!val || val === 'null' || val === '') return null;
  const d = new Date(val);
  return (!isNaN(d.getTime()) && d.getFullYear() >= 1990) ? d : null;
};

const getLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

const dateFromStr = (s: string): Date => {
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
};

export default function AddInventoryScreen() {
  const router = useRouter();
  const { id, preselected_visit_id } = useLocalSearchParams();
  const isEditMode = !!id;
  const inventoryId = Number(id);

  const [userId, setUserId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [form, setForm] = useState<'PILL' | 'SYRUP'>('PILL');
  const [unit, setUnit] = useState('ks');
  const [qty, setQty] = useState('');
  const [expDate, setExpDate] = useState<Date | null>(null);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);

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
        if (isEditMode) {
          try {
            const invData = await db.select().from(inventory).where(eq(inventory.inventory_id, inventoryId));
            if (invData.length > 0) {
              const item = invData[0];
              setName(item.medication_name);
              setForm(item.form as 'PILL' | 'SYRUP');
              setUnit(item.unit);
              setQty(item.total_qty.toString());
              setExpDate(getSafeDate(item.expiration_date));
            }
          } catch (e) {}
        }
      };
      fetchUserAndData();
    }, [isEditMode, inventoryId])
  );

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Chyba', 'Zadejte název léku.');
    const newTotalQty = parseFloat(qty.replace(',', '.')) || 0;
    if (newTotalQty <= 0) return Alert.alert('Chyba', 'Množství musí být větší než 0.');
    try {
      if (isEditMode) {
        const existingData = await db.select().from(inventory).where(eq(inventory.inventory_id, inventoryId));
        if (existingData.length > 0) {
          const item = existingData[0];
          const consumed = item.total_qty - item.remaining_qty;
          if (newTotalQty < consumed) return Alert.alert('Nelze uložit', `Z této krabičky jsi už spotřeboval ${consumed} ${unit}. Celkové balení tedy musí mít alespoň tolik.`);
          const updatePayload: any = {
            medication_name: name.trim(), form, unit, total_qty: newTotalQty, remaining_qty: newTotalQty - consumed,
            expiration_date: expDate ? getLocalDateStr(expDate) : null,
          };
          if (preselected_visit_id) updatePayload.visit_id = Number(preselected_visit_id);
          await db.update(inventory).set(updatePayload).where(eq(inventory.inventory_id, inventoryId));
        }
      } else {
        await db.insert(inventory).values({
          user_id: userId, medication_name: name.trim(), form, unit,
          total_qty: newTotalQty, remaining_qty: newTotalQty,
          expiration_date: expDate ? getLocalDateStr(expDate) : null,
          status: 'ACTIVE', created_at: new Date().toISOString(),
          visit_id: preselected_visit_id ? Number(preselected_visit_id) : null,
        });
      }
      router.back();
    } catch (e) { Alert.alert('Chyba', 'Nepodařilo se uložit data do databáze.'); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true, fullScreenGestureEnabled: true }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ zIndex: 10 }}>
          <MaterialCommunityIcons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: 1 }]}>
          {isEditMode ? 'Úprava Krabičky' : 'Přidat do Lékárničky'}
        </Text>
        <TouchableOpacity onPress={handleSave} style={{ zIndex: 10 }}>
          <MaterialCommunityIcons name="check" size={28} color={colors.third} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.label}>NÁZEV LÉKU (Co je na krabičce?)</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Např. Zyrtec 10mg, Ibalgin 400..." />

        <Text style={[styles.label, { marginTop: 20 }]}>FORMA LÉKU</Text>
        <View style={styles.toggleContainer}>
          <TouchableOpacity style={[styles.toggleBtn, form === 'PILL' && styles.activeToggle]} onPress={() => { setForm('PILL'); setUnit('ks'); }}>
            <Text style={[styles.toggleBtnText, form === 'PILL' && { color: colors.third, fontWeight: 'bold' }]}>Prášky (ks)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, form === 'SYRUP' && styles.activeToggle]} onPress={() => { setForm('SYRUP'); setUnit('ml'); }}>
            <Text style={[styles.toggleBtnText, form === 'SYRUP' && { color: colors.third, fontWeight: 'bold' }]}>Kapky/Sirup (ml)</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { marginTop: 20 }]}>KOLIK JE TOHO CELKEM V BALENÍ?</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1, marginRight: 15, fontSize: 20, fontWeight: 'bold' }]} keyboardType="numeric" value={qty} onChangeText={setQty} placeholder="Např. 30" />
          <View style={[styles.input, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#EEE' }]}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#888' }}>{unit}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.label}>EXPIRACE (Do kdy to platí?)</Text>
        <TouchableOpacity style={styles.datePickerBtn} onPress={() => { Keyboard.dismiss(); setDatePickerVisible(true); }}>
          <MaterialCommunityIcons name="calendar-clock" size={20} color={expDate ? colors.third : '#666'} />
          <Text style={[styles.datePickerText, expDate && { color: colors.third, fontWeight: 'bold' }]}>
            {expDate ? expDate.toLocaleDateString('cs-CZ') : 'Zadat datum (Volitelné)'}
          </Text>
          {expDate && (
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); setExpDate(null); }} style={{ marginLeft: 'auto' }}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#FF5252" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </ScrollView>

      <CalendarPicker
        visible={isDatePickerVisible}
        title="Datum expirace"
        currentDate={expDate ? getLocalDateStr(expDate) : getLocalDateStr(new Date())}
        markedDates={expDate ? { [getLocalDateStr(expDate)]: { selected: true, selectedColor: colors.third } } : {}}
        onDayPress={(day) => { setExpDate(dateFromStr(day.dateString)); setDatePickerVisible(false); }}
        onClose={() => setDatePickerVisible(false)}
        themeColor={colors.third}
        deleteLabel={expDate ? 'Smazat' : undefined}
        onDelete={() => setExpDate(null)}
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
  row: { flexDirection: 'row', alignItems: 'center' },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#F8F8F8', borderRadius: 12, padding: 4, marginTop: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeToggle: { backgroundColor: '#FFF', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  toggleBtnText: { color: '#888', fontSize: 14 },
  divider: { height: 1, backgroundColor: '#F2F2F2', marginVertical: 25 },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, marginTop: 8, gap: 10 },
  datePickerText: { fontSize: 16, color: '#666' },
});