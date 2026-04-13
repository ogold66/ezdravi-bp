import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from '../db';
// @ts-ignore
import migrations from '../drizzle/migrations';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

// Globální paměť řešící problém s vícenásobným vykreslováním v React Strict Mode
let globalAuthLock = false;       // Brání dvojitému vyvolání FaceID
let globalAlreadyUnlocked = false; // Říká všem instancím, že už je odemčeno

const Layout = () => {
  const { success, error } = useMigrations(db, migrations);
  
  // Rovnou se podíváme do globální paměti, jestli náhodou už není odemčeno
  const [isUnlocked, setIsUnlocked] = useState(globalAlreadyUnlocked);
  const [isCheckingLock, setIsCheckingLock] = useState(!globalAlreadyUnlocked);
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const initApp = async () => {
      // Pokud už to nějaká jiná instance odemkla, nic neřešíme a končíme
      if (globalAlreadyUnlocked) return;

      try {
        const storedId = await SecureStore.getItemAsync('activeUserId');
        if (storedId) {
          const u = await db.select().from(users).where(eq(users.user_id, Number(storedId)));
          if (u.length > 0) setUserName(u[0].name);
        }

        const lockEnabled = await SecureStore.getItemAsync('app_lock_enabled');
        if (lockEnabled === 'true') {
          setIsLockEnabled(true);
        } else {
          globalAlreadyUnlocked = true;
          setIsUnlocked(true);
        }
      } catch (e) {
        globalAlreadyUnlocked = true;
        setIsUnlocked(true); 
      } finally {
        setIsCheckingLock(false);
      }
    };

    if (success && !globalAlreadyUnlocked) {
       initApp();
    }
  }, [success]);

  const triggerAuth = async () => {
    // Pokud už se autentizuje, nebo už je odemčeno, tlačítko nereaguje
    if (globalAuthLock || globalAlreadyUnlocked) return;
    globalAuthLock = true;
    
    try {
        const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Odemkněte eZdraví',
        fallbackLabel: 'Použít kód',
        cancelLabel: 'Zrušit',
        disableDeviceFallback: false,
      });
        
        if (auth.success) {
          globalAlreadyUnlocked = true; // Zapsáno do globální paměti!
          setIsUnlocked(true);
        }
    } catch(e) {
        console.log(e);
    } finally {
        // Zámek tlačítka uvolníme až po 1 sekundě pro jistotu
        setTimeout(() => {
            globalAuthLock = false;
        }, 1000);
    }
  };

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: 'red', fontSize: 18, fontWeight: 'bold' }}>Kritická chyba databáze!</Text>
        <Text>{error.message}</Text>
      </View>
    );
  }

  // Pokud už je odemčeno, loader vůbec neukazujeme
  if (!success || (isCheckingLock && !globalAlreadyUnlocked)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' }}>
        <ActivityIndicator size="large" color="#4CAF50" /> 
      </View>
    );
  }

  // Ochranný blok: Vykreslení zamykací obrazovky. Zamykací obrazovka se ukáže jen tehdy, pokud je zámek zapnutý a aplikace NENÍ odemčená
  if (isLockEnabled && !isUnlocked && !globalAlreadyUnlocked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF', padding: 20 }}>
        <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 30 }}>
          <MaterialCommunityIcons name="shield-check" size={50} color="#4CAF50" />
        </View>
        <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#111' }}>Vítej zpět,</Text>
        <Text style={{ fontSize: 26, fontWeight: 'bold', color: '#4CAF50', marginBottom: 15 }}>{userName || 'Uživateli'}</Text>
        <Text style={{ fontSize: 15, color: '#666', marginBottom: 50 }}>Aplikace je uzamčena pro tvé soukromí.</Text>
        
        <TouchableOpacity 
          onPress={triggerAuth}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', backgroundColor: '#4CAF50', paddingVertical: 18, paddingHorizontal: 30, borderRadius: 16, alignItems: 'center', gap: 10, width: '100%', justifyContent: 'center' }}
        >
          <MaterialCommunityIcons name="face-recognition" size={24} color="#FFF" />
          <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>Odemknout aplikaci</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)"/>
    </Stack>
  );
};

export default Layout;
