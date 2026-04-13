import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, TouchableOpacity, Alert, ScrollView, Keyboard, Modal, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useRouter, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CalendarPicker from '@/components/CalendarPicker';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import * as ImagePicker from 'expo-image-picker'; 
import colors from '@/components/colors';
import { db } from '../db';
import { visits, users, diseases, visitDocuments } from '../db/schema';
import { eq, desc, inArray } from 'drizzle-orm'; 
import * as SecureStore from 'expo-secure-store';

const getSafeDate = (val: any): Date => {
  if (!val || val === 'null' || val === '') return new Date();
  const d = new Date(val);
  if (isNaN(d.getTime()) || d.getFullYear() < 1990) return new Date();
  return d;
};

const getLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

const dateFromStr = (s: string): Date => {
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
};

export default function AddVisitScreen() {
  const router = useRouter();
  const { id, preselected_disease_id } = useLocalSearchParams();
  const isEditMode = !!id;
  const visitId = Number(id);

  const [userId, setUserId] = useState<number | null>(null);
  
  const [doctor, setDoctor] = useState('');
  const [department, setDepartment] = useState('');
  const [hospital, setHospital] = useState('');
  
  const [note, setNote] = useState('');
  const [visitDate, setVisitDate] = useState<Date>(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; });
  const [visitTime, setVisitTime] = useState<Date>(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; });
  
  const [allDiseases, setAllDiseases] = useState<any[]>([]);
  const [selectedDiseaseId, setSelectedDiseaseId] = useState<number | null>(null);
  
  const [showDiseaseModal, setShowDiseaseModal] = useState(false);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);

  // --- STAVY PRO FOTKY ---
  const [existingImages, setExistingImages] = useState<any[]>([]); // Fotky už uložené v DB
  const [deletedImageIds, setDeletedImageIds] = useState<number[]>([]); // ID fotek, které chce uživatel smazat
  const [newImages, setNewImages] = useState<string[]>([]); // Nově vyfocené

  const getMergedDate = (date = visitDate, time = visitTime) => {
    const d = new Date(date);
    d.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return d;
  };

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
        try {
          const diseasesList = await db.select().from(diseases);
          setAllDiseases(diseasesList);
          
          if (preselected_disease_id) {
            setSelectedDiseaseId(Number(preselected_disease_id));
            if (!isEditMode) {
              const preselectedDisease = diseasesList.find(d => d.disease_id === Number(preselected_disease_id));
              if (preselectedDisease && preselectedDisease.start_date) {
                setVisitDate(getSafeDate(preselectedDisease.start_date));
              }
            }
          }
        } catch (e) {}
        
        if (isEditMode) {
          try {
            const data = await db.select().from(visits).where(eq(visits.visit_id, visitId));
            if (data.length > 0) {
              const item = data[0];
              setDoctor(item.doctor || '');
              setDepartment(item.department || ''); 
              setHospital(item.hospital || '');     
              setNote(item.note || '');
              const safeD = getSafeDate(item.date);
              setVisitDate(safeD);
              setVisitTime(safeD);
              if (!preselected_disease_id) setSelectedDiseaseId(item.disease_id);
            }

            // NAČTENÍ EXISTUJÍCÍCH FOTEK
            const docs = await db.select().from(visitDocuments).where(eq(visitDocuments.visit_id, visitId));
            setExistingImages(docs);

          } catch (e) {}
        }
      };
      fetchUserAndData();
    }, [isEditMode, visitId, preselected_disease_id])
  );

  const handleConfirmTime = (date: Date) => {
    setVisitTime(date);
    setTimePickerVisible(false);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Přístup odepřen', 'Aplikace potřebuje přístup k fotoaparátu.');
    
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled) {
      setNewImages(prev => [...prev, result.assets[0].uri]);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
    });

    if (!result.canceled) {
      const selectedUris = result.assets.map(a => a.uri);
      setNewImages(prev => [...prev, ...selectedUris]);
    }
  };

  // Smazání nové (ještě neuložené) fotky
  const removeNewImage = (index: number) => {
    setNewImages(prev => prev.filter((_, i) => i !== index));
  };

  // Smazání staré (už uložené) fotky
  const removeExistingImage = (docId: number) => {
    setExistingImages(prev => prev.filter(img => img.document_id !== docId));
    setDeletedImageIds(prev => [...prev, docId]); // Poznačíme si ID pro smazání v DB
  };

  const handleSave = async () => {
    if (!doctor.trim() && !department.trim() && !hospital.trim()) {
      return Alert.alert('Chyba', 'Zadejte alespoň lékaře, oddělení nebo nemocnici.');
    }
    
    const finalDate = getMergedDate();
    const payload = {
      user_id: userId, 
      disease_id: selectedDiseaseId, 
      doctor: doctor.trim() || null,
      department: department.trim() || null, 
      hospital: hospital.trim() || null,     
      status: finalDate < new Date() ? 'COMPLETED' : 'PLANNED',
      date: finalDate.toISOString(), 
      note: note.trim() || null,
    };

    try {
      let currentVisitId = visitId;

      if (isEditMode) { 
        await db.update(visits).set(payload).where(eq(visits.visit_id, visitId)); 
      } else { 
        await db.insert(visits).values(payload); 
        const lastVisit = await db.select().from(visits).where(eq(visits.user_id, userId as number)).orderBy(desc(visits.visit_id)).limit(1);
        if (lastVisit.length > 0) currentVisitId = lastVisit[0].visit_id;
      }

      // SMAZÁNÍ ODSTRANĚNÝCH FOTEK Z DB
      if (deletedImageIds.length > 0) {
        await db.delete(visitDocuments).where(inArray(visitDocuments.document_id, deletedImageIds));
      }

      // ULOŽENÍ NOVÝCH FOTEK
      if (newImages.length > 0 && currentVisitId) {
        const docsPayload = newImages.map(uri => ({
          visit_id: currentVisitId,
          uri: uri,
          type: 'IMAGE',
          created_at: new Date().toISOString()
        }));
        await db.insert(visitDocuments).values(docsPayload);
      }

      router.back();
    } catch (e) { 
      Alert.alert('Chyba', 'Nepodařilo se uložit návštěvu.'); 
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ zIndex: 10 }}>
          <MaterialCommunityIcons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: 1 }]}>
          {isEditMode ? 'Úprava Návštěvy' : 'Nová Návštěva'}
        </Text>
        <TouchableOpacity onPress={handleSave} style={{ zIndex: 10 }}>
          <MaterialCommunityIcons name="check" size={28} color="#2196F3" />
        </TouchableOpacity>
      </View>
      
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 150 }} automaticallyAdjustKeyboardInsets={true} keyboardShouldPersistTaps="handled">
          
          <Text style={styles.label}>LÉKAŘ (Jméno)</Text>
          <TextInput style={styles.input} value={doctor} onChangeText={setDoctor} placeholder="Např. MUDr. Novák" />

          <Text style={[styles.label, { marginTop: 20 }]}>ODDĚLENÍ / SPECIALIZACE</Text>
          <TextInput style={styles.input} value={department} onChangeText={setDepartment} placeholder="Např. Kardiologie, Zubař..." />

          <Text style={[styles.label, { marginTop: 20 }]}>NEMOCNICE / KLINIKA</Text>
          <TextInput style={styles.input} value={hospital} onChangeText={setHospital} placeholder="Např. FN Motol" />

          <Text style={[styles.label, { marginTop: 25 }]}>SOUVISÍ TO S NĚJAKOU DIAGNÓZOU?</Text>
          <TouchableOpacity
            style={[styles.dropdownBtn, preselected_disease_id ? { backgroundColor: '#F0F0F0', opacity: 0.8 } : {}]}
            onPress={() => { Keyboard.dismiss(); setShowDiseaseModal(true); }}
            disabled={!!preselected_disease_id}
          >
            <Text style={{ fontSize: 16, color: selectedDiseaseId ? '#333' : '#888' }}>
              {selectedDiseaseId 
                ? (() => {
                    const d = allDiseases.find(d => d.disease_id === selectedDiseaseId);
                    return d ? `${d.disease_name} (${new Date(d.start_date).toLocaleDateString('cs-CZ')})` : 'Neznámá diagnóza';
                  })()
                : 'Nevybráno (Preventivní prohlídka)'}
            </Text>
            {preselected_disease_id
              ? <MaterialCommunityIcons name="lock" size={20} color="#AAA" />
              : <MaterialCommunityIcons name="chevron-down" size={24} color="#888" />}
          </TouchableOpacity>

          <Text style={[styles.label, { marginTop: 25 }]}>STAV NÁVŠTĚVY (Mění se automaticky)</Text>
          <View style={styles.toggleContainer}>
            <TouchableOpacity style={[styles.toggleBtn, getMergedDate() < new Date() && styles.activeToggle]} disabled>
              <Text style={[styles.toggleBtnText, getMergedDate() < new Date() && { color: '#4CAF50', fontWeight: 'bold' }]}>Proběhla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.toggleBtn, getMergedDate() >= new Date() && styles.activeToggle]} disabled>
              <Text style={[styles.toggleBtnText, getMergedDate() >= new Date() && { color: '#FF9800', fontWeight: 'bold' }]}>Plánovaná</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { marginTop: 25 }]}>DATUM A ČAS NÁVŠTĚVY</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <TouchableOpacity style={[styles.datePickerBtn, { flex: 1 }]} onPress={() => { Keyboard.dismiss(); setDatePickerVisible(true); }}>
              <MaterialCommunityIcons name="calendar" size={20} color="#666" />
              <Text style={styles.datePickerText}>{visitDate.toLocaleDateString('cs-CZ')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.datePickerBtn, { flex: 1 }]} onPress={() => { Keyboard.dismiss(); setTimePickerVisible(true); }}>
              <MaterialCommunityIcons name="clock-outline" size={20} color="#666" />
              <Text style={styles.datePickerText}>{visitTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { marginTop: 25 }]}>DŮVOD NÁVŠTĚVY A POZNÁMKY</Text>
          <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} placeholder="Např. Kontrola po diagnóze..." multiline scrollEnabled={false} />

          <Text style={[styles.label, { marginTop: 30 }]}>LÉKAŘSKÁ ZPRÁVA (FOTKY)</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
              <MaterialCommunityIcons name="camera" size={20} color="#2196F3" />
              <Text style={styles.photoBtnText}>Vyfotit zprávu</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
              <MaterialCommunityIcons name="image-multiple" size={20} color="#2196F3" />
              <Text style={styles.photoBtnText}>Nahrát z galerie</Text>
            </TouchableOpacity>
          </View>

          {/* VYKRESLENÍ VŠECH FOTEK */}
          {(existingImages.length > 0 || newImages.length > 0) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 15 }}>
              
              {/* Staré fotky z DB */}
              {existingImages.map((img) => (
                <View key={`old-${img.document_id}`} style={styles.imagePreviewContainer}>
                  <Image source={{ uri: img.uri }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.removeImgBtn} onPress={() => removeExistingImage(img.document_id)}>
                    <MaterialCommunityIcons name="close" size={14} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Nové fotky */}
              {newImages.map((uri, idx) => (
                <View key={`new-${idx}`} style={styles.imagePreviewContainer}>
                  <Image source={{ uri }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.removeImgBtn} onPress={() => removeNewImage(idx)}>
                    <MaterialCommunityIcons name="close" size={14} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      <CalendarPicker
        visible={isDatePickerVisible}
        title="Datum návštěvy"
        currentDate={getLocalDateStr(visitDate)}
        markedDates={{ [getLocalDateStr(visitDate)]: { selected: true, selectedColor: '#2196F3' } }}
        onDayPress={(day) => { setVisitDate(dateFromStr(day.dateString)); setDatePickerVisible(false); }}
        onClose={() => setDatePickerVisible(false)}
        themeColor="#2196F3"
      />

      <DateTimePickerModal
        isVisible={isTimePickerVisible}
        mode="time"
        date={new Date(visitTime)}
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
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  label: { fontSize: 11, fontWeight: 'bold', color: '#AAA', letterSpacing: 1 },
  input: { backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, marginTop: 8, fontSize: 16, color: '#333' },
  dropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, marginTop: 8 },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#F8F8F8', borderRadius: 12, padding: 4, marginTop: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeToggle: { backgroundColor: '#FFF', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  toggleBtnText: { color: '#888', fontSize: 14 },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8', padding: 15, borderRadius: 12, gap: 10 },
  datePickerText: { fontSize: 16, color: '#333', fontWeight: '500' },
  calOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  calContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  calTitle: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  connectionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EEE', marginBottom: 10 },
  
  // Styly pro focení
  photoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3F2FD', padding: 15, borderRadius: 12, gap: 8 },
  photoBtnText: { color: '#2196F3', fontWeight: 'bold', fontSize: 15 },
  
  // OPRAVA OŘÍZNUTÍ KŘÍŽKŮ
  imagePreviewContainer: { marginRight: 15, position: 'relative', paddingTop: 8, paddingRight: 8 }, 
  imagePreview: { width: 90, height: 120, borderRadius: 12, borderWidth: 1, borderColor: '#EEE' },
  removeImgBtn: { position: 'absolute', top: 0, right: 0, backgroundColor: '#FF5252', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF', zIndex: 10 }
});