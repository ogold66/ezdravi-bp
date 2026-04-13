import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import colors from '@/components/colors';
import { db } from '../db';
import { users } from '../db/schema';

type AppState = 'LOADING' | 'TUTORIAL_1' | 'TUTORIAL_2' | 'TUTORIAL_3' | 'REGISTER';

export default function Index() {
  const router = useRouter();
  const [appState, setAppState] = useState<AppState>('LOADING');
  const [newUserName, setNewUserName] = useState('');

  useEffect(() => {
    checkUserAndInit();
  }, []);

  const checkUserAndInit = async () => {
    try {
      const allUsers = await db.select().from(users);
      if (allUsers.length > 0) {
        // Uživatel existuje. Přeskočíme tutorial a jdeme rovnou do aplikace.
        // O zabezpečení (FaceID) se automaticky postará nadřazený _layout.tsx!
        router.replace('/(tabs)');
      } else {
        // První spuštění -> Jdeme na Tutorial
        setAppState('TUTORIAL_1');
      }
    } catch (e) {
      console.error(e);
      setAppState('TUTORIAL_1');
    }
  };

  const handleRegister = async () => {
    if (!newUserName.trim()) {
      Alert.alert('Chyba', 'Zadejte prosím své jméno nebo přezdívku.');
      return;
    }
    try {
      await db.insert(users).values({
        name: newUserName.trim(),
        created_at: new Date().toISOString(),
      });
      // Po vytvoření profilu jdeme rovnou do aplikace
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Chyba', 'Nepodařilo se vytvořit profil.');
    }
  };

  if (appState === 'LOADING') {
    return <SafeAreaView style={styles.container} />;
  }

  // --- OBRAZOVKA: VYTVOŘENÍ PROFILU ---
  if (appState === 'REGISTER') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.tutorialContent}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="account-heart" size={50} color={colors.third} />
          </View>
          <Text style={styles.title}>Vytvoř si profil</Text>
          <Text style={styles.subtitle}>Tvá data zůstávají bezpečně uložena pouze v tomto zařízení.</Text>
          
          <View style={{ width: '100%', marginTop: 30 }}>
            <Text style={styles.label}>TVÉ JMÉNO / PŘEZDÍVKA</Text>
            <TextInput 
              style={styles.input} 
              value={newUserName} 
              onChangeText={setNewUserName} 
              placeholder="Např. Jan Novák" 
              autoFocus
            />
          </View>
        </View>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={[styles.primaryBtn, { width: '100%' }]} onPress={handleRegister}>
            <Text style={styles.primaryBtnText}>Vstoupit do aplikace</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // --- OBRAZOVKY: TUTORIAL ---
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.tutorialContent}>
        {appState === 'TUTORIAL_1' && (
          <View style={{ alignItems: 'center' }}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="heart-pulse" size={60} color={colors.third} />
            </View>
            <Text style={styles.title}>Vítejte v eZdraví</Text>
            <Text style={styles.subtitle}>Tvá osobní zdravotní karta vždy po ruce. Měj své zdraví plně pod kontrolou.</Text>
          </View>
        )}
        
        {appState === 'TUTORIAL_2' && (
          <View style={{ alignItems: 'center' }}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="medical-bag" size={60} color={colors.third} />
            </View>
            <Text style={styles.title}>Chytrá lékárnička</Text>
            <Text style={styles.subtitle}>Sleduj zásoby a expirace svých léků. Už nikdy ti nedojdou léky ve špatnou chvíli.</Text>
          </View>
        )}

        {appState === 'TUTORIAL_3' && (
          <View style={{ alignItems: 'center' }}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="file-document-outline" size={60} color={colors.third} />
            </View>
            <Text style={styles.title}>Návštěvy a Reporty</Text>
            <Text style={styles.subtitle}>Uchovávej historii diagnóz a generuj PDF reporty pro svého lékaře na jedno kliknutí.</Text>
          </View>
        )}
      </View>

      {/* Navigační tečky a tlačítka dole */}
      <View style={styles.bottomNav}>
        <View style={styles.dotsContainer}>
          <View style={[styles.dot, appState === 'TUTORIAL_1' && styles.activeDot]} />
          <View style={[styles.dot, appState === 'TUTORIAL_2' && styles.activeDot]} />
          <View style={[styles.dot, appState === 'TUTORIAL_3' && styles.activeDot]} />
        </View>

        <TouchableOpacity 
          style={styles.primaryBtn} 
          onPress={() => {
            if (appState === 'TUTORIAL_1') setAppState('TUTORIAL_2');
            else if (appState === 'TUTORIAL_2') setAppState('TUTORIAL_3');
            else if (appState === 'TUTORIAL_3') setAppState('REGISTER');
          }}
        >
          <Text style={styles.primaryBtnText}>{appState === 'TUTORIAL_3' ? 'Vytvořit profil' : 'Další'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  tutorialContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  iconCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111', textAlign: 'center', marginBottom: 15 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24 },
  bottomNav: { padding: 30, paddingBottom: 50 },
  dotsContainer: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 30 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E0E0E0' },
  activeDot: { backgroundColor: colors.third, width: 24 },
  primaryBtn: { backgroundColor: colors.third, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 18, borderRadius: 16, shadowColor: colors.third, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  primaryBtnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  label: { fontSize: 12, fontWeight: 'bold', color: '#AAA', letterSpacing: 1, marginBottom: 10 },
  input: { backgroundColor: '#F5F5F5', padding: 18, borderRadius: 16, fontSize: 18, color: '#333', fontWeight: 'bold', textAlign: 'center' },
});