import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, Switch } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

import * as FileSystem from 'expo-file-system/legacy'; 

import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import colors from '@/components/colors';
import { db } from '../../db';
import { users, diseases, visits, inventory, medicationPlans, medicationLogs, visitDocuments } from '../../db/schema'; 

export default function UserScreen() {
  const [userList, setUserList] = useState<any[]>([]);
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);

  const fs = FileSystem as any;

  const loadUsersAndSettings = async () => {
    try {
      const all = await db.select().from(users);
      setUserList(all);

      const storedId = await SecureStore.getItemAsync('activeUserId');
      if (storedId) {
        setActiveUserId(Number(storedId));
      } else if (all.length > 0) {
        setActiveUserId(all[0].user_id);
        await SecureStore.setItemAsync('activeUserId', all[0].user_id.toString());
      }

      const lockSetting = await SecureStore.getItemAsync('app_lock_enabled');
      setIsBiometricEnabled(lockSetting === 'true');
    } catch (e) {
      console.error('Chyba při načítání:', e);
    }
  };

  useFocusEffect(useCallback(() => { loadUsersAndSettings(); }, []));

  const handleAddUser = async () => {
    if (!newUserName.trim()) return Alert.alert('Chyba', 'Zadej prosím jméno.');
    try {
      await db.insert(users).values({ name: newUserName.trim(), created_at: new Date().toISOString() });
      setNewUserName('');
      setShowAddModal(false);
      loadUsersAndSettings();
    } catch (e) { Alert.alert('Chyba', 'Nepodařilo se přidat profil.'); }
  };

  const handleSwitchUser = async (id: number, name: string) => {
    try {
      await SecureStore.setItemAsync('activeUserId', id.toString()); 
      setActiveUserId(id);
      Alert.alert('Profil přepnut', `Nyní spravuješ profil: ${name}`);
    } catch (e) {}
  };

  const toggleBiometricLock = async () => {
    try {
      if (!isBiometricEnabled) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) return Alert.alert('Nelze aktivovat', 'Váš telefon nepodporuje FaceID/TouchID, nebo není nastaveno.');

        const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Odemkněte eZdraví',
        fallbackLabel: 'Použít kód',
        cancelLabel: 'Zrušit', 
        disableDeviceFallback: false,
      });

        if (auth.success) {
          await SecureStore.setItemAsync('app_lock_enabled', 'true');
          setIsBiometricEnabled(true);
        }
      } else {
        await SecureStore.deleteItemAsync('app_lock_enabled');
        setIsBiometricEnabled(false);
      }
    } catch (e) { Alert.alert('Chyba', 'Nastala chyba při nastavování zámku.'); }
  };

  // ==========================================
  // EXPORT 
  // ==========================================
  const handleExportData = async () => {
    try {
      const backup = {
        users: await db.select().from(users).catch(() => []),
        diseases: await db.select().from(diseases).catch(() => []),
        visits: await db.select().from(visits).catch(() => []),
        inventory: await db.select().from(inventory).catch(() => []),
        medicationPlans: await db.select().from(medicationPlans).catch(() => []),
        medicationLogs: await db.select().from(medicationLogs).catch(() => []),
        visitDocuments: await db.select().from(visitDocuments).catch(() => []),
      };

      const jsonString = JSON.stringify(backup);
      
      const fileUri = fs.documentDirectory + 'ezdravi_zaloha.json';
      
      await fs.writeAsStringAsync(fileUri, jsonString, { encoding: 'utf8' });

      await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Exportovat zálohu eZdraví', UTI: 'public.json' });
    } catch (e: any) { 
      Alert.alert('Chyba Exportu', e.message || 'Nepodařilo se vytvořit zálohu.'); 
    }
  };

  // ==========================================
  // IMPORT
  // ==========================================
  const handleImportData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
      if (result.canceled) return;

      const fileContent = await fs.readAsStringAsync(result.assets[0].uri, { encoding: 'utf8' });
      const backup = JSON.parse(fileContent);

      if (!backup.users || !backup.diseases) return Alert.alert('Chyba', 'Vybraný soubor není platnou zálohou.');

      Alert.alert(
        'Obnova dat',
        'Tato akce SMAŽE VŠECHNA AKTUÁLNÍ DATA v aplikaci a nahradí je daty ze zálohy. Opravdu chcete pokračovat?',
        [
          { text: 'Zrušit', style: 'cancel' },
          { text: 'Ano, přepsat data', style: 'destructive', onPress: async () => {
              try {
                await db.delete(medicationLogs).catch(() => {});
                await db.delete(medicationPlans).catch(() => {});
                await db.delete(inventory).catch(() => {});
                await db.delete(visitDocuments).catch(() => {});
                await db.delete(visits).catch(() => {});
                await db.delete(diseases).catch(() => {});
                await db.delete(users).catch(() => {});

                if (backup.users?.length > 0) await db.insert(users).values(backup.users);
                if (backup.diseases?.length > 0) await db.insert(diseases).values(backup.diseases);
                if (backup.visits?.length > 0) await db.insert(visits).values(backup.visits);
                if (backup.visitDocuments?.length > 0) await db.insert(visitDocuments).values(backup.visitDocuments);
                if (backup.inventory?.length > 0) await db.insert(inventory).values(backup.inventory);
                if (backup.medicationPlans?.length > 0) await db.insert(medicationPlans).values(backup.medicationPlans);
                if (backup.medicationLogs?.length > 0) await db.insert(medicationLogs).values(backup.medicationLogs);

                Alert.alert('Úspěch', 'Data byla úspěšně obnovena ze zálohy.');
                loadUsersAndSettings(); 
              } catch (e: any) { Alert.alert('Kritická chyba', 'Obnova selhala.'); }
          }}
        ]
      );
    } catch (e) { Alert.alert('Chyba', 'Nepodařilo se načíst soubor.'); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}><Text style={styles.headerTitle}>Můj Účet & Rodina</Text></View>
      <ScrollView contentContainerStyle={styles.content}>
        
        <Text style={styles.sectionLabel}>PŘEPNOUT PROFIL</Text>
        <View style={styles.profilesContainer}>
          {userList.map((u) => {
            const isActive = u.user_id === activeUserId;
            return (
              <TouchableOpacity key={u.user_id} style={[styles.profileCard, isActive && styles.profileCardActive]} activeOpacity={0.7} onPress={() => handleSwitchUser(u.user_id, u.name)}>
                <View style={[styles.avatarBox, isActive ? { backgroundColor: colors.third } : { backgroundColor: '#F0F0F0' }]}><MaterialCommunityIcons name="account" size={28} color={isActive ? '#FFF' : '#AAA'} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.profileName, isActive && { color: colors.third }]}>{u.name}</Text>
                  <Text style={styles.profileSub}>{isActive ? 'Aktivní profil' : 'Klepnutím přepneš'}</Text>
                </View>
                {isActive && <MaterialCommunityIcons name="check-circle" size={24} color={colors.third} />}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.addProfileBtn} onPress={() => setShowAddModal(true)}>
            <MaterialCommunityIcons name="account-plus-outline" size={22} color="#666" />
            <Text style={styles.addProfileText}>Přidat člena rodiny</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 30 }]}>DATA A NASTAVENÍ</Text>
        <View style={styles.settingsContainer}>
          <TouchableOpacity style={styles.settingsRow} activeOpacity={0.7} onPress={handleExportData}>
            <View style={[styles.settingsIconBox, { backgroundColor: '#E3F2FD' }]}><MaterialCommunityIcons name="cloud-upload-outline" size={22} color="#2196F3" /></View>
            <View style={{ flex: 1 }}><Text style={styles.settingsTitle}>Vytvořit zálohu dat</Text><Text style={styles.settingsSub}>Exportovat databázi do souboru</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#CCC" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsRow} activeOpacity={0.7} onPress={handleImportData}>
            <View style={[styles.settingsIconBox, { backgroundColor: '#F4FBF5' }]}><MaterialCommunityIcons name="cloud-download-outline" size={22} color="#4CAF50" /></View>
            <View style={{ flex: 1 }}><Text style={styles.settingsTitle}>Obnovit ze zálohy</Text><Text style={styles.settingsSub}>Načíst existující soubor .json</Text></View>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#CCC" />
          </TouchableOpacity>

          <View style={[styles.settingsRow, { borderBottomWidth: 0 }]}>
            <View style={[styles.settingsIconBox, { backgroundColor: '#FFF5F5' }]}><MaterialCommunityIcons name="shield-lock-outline" size={22} color="#FF5252" /></View>
            <View style={{ flex: 1 }}><Text style={styles.settingsTitle}>Zámek aplikace</Text><Text style={styles.settingsSub}>Vyžadovat FaceID / TouchID</Text></View>
            <Switch value={isBiometricEnabled} onValueChange={toggleBiometricLock} trackColor={{ false: '#EEE', true: '#FFCDD2' }} thumbColor={isBiometricEnabled ? '#FF5252' : '#FFF'} />
          </View>
        </View>
      </ScrollView>

      <Modal transparent visible={showAddModal} animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nový profil</Text>
            <Text style={styles.modalSub}>Zadej jméno dalšího člena rodiny.</Text>
            <TextInput style={styles.input} autoFocus placeholder="Např. Babička, Syn..." value={newUserName} onChangeText={setNewUserName} />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.btnSec}><Text style={styles.btnSecText}>Zrušit</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleAddUser} style={styles.btnPrim}><Text style={styles.btnPrimText}>Přidat profil</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFA' }, header: { padding: 20, paddingTop: 30, paddingBottom: 10 }, headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#111' }, content: { padding: 20, paddingBottom: 50 }, sectionLabel: { fontSize: 12, fontWeight: '800', color: '#AAA', letterSpacing: 1, marginBottom: 15, marginLeft: 5 }, profilesContainer: { gap: 10 }, profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#EEE' }, profileCardActive: { borderColor: colors.third, backgroundColor: '#F0FDF4', borderWidth: 2 }, avatarBox: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 }, profileName: { fontSize: 16, fontWeight: 'bold', color: '#333' }, profileSub: { fontSize: 13, color: '#888', marginTop: 2 }, addProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 16, borderStyle: 'dashed', borderWidth: 1, borderColor: '#CCC', marginTop: 5 }, addProfileText: { fontSize: 14, fontWeight: 'bold', color: '#666', marginLeft: 8 }, settingsContainer: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#EEE', overflow: 'hidden' }, settingsRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' }, settingsIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 }, settingsTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' }, settingsSub: { fontSize: 13, color: '#888', marginTop: 2 }, modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 }, modalCard: { width: '100%', backgroundColor: '#FFF', borderRadius: 24, padding: 25 }, modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 8 }, modalSub: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 20 }, input: { backgroundColor: '#F8F8F8', padding: 16, borderRadius: 12, fontSize: 16, color: '#333', fontWeight: '500', marginBottom: 25 }, modalActions: { flexDirection: 'row', gap: 10 }, btnSec: { flex: 1, padding: 15, borderRadius: 12, backgroundColor: '#F0F0F0', alignItems: 'center' }, btnSecText: { fontWeight: 'bold', color: '#666', fontSize: 15 }, btnPrim: { flex: 1, padding: 15, borderRadius: 12, backgroundColor: colors.third, alignItems: 'center' }, btnPrimText: { fontWeight: 'bold', color: '#FFF', fontSize: 15 }
});