import React from 'react';
import { Tabs } from 'expo-router';
import colors from '@/components/colors';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        // Skryje texty
        tabBarShowLabel: false, 
        
        // Zabrání iOS a Androidu zvedat lištu kvůli domovskému proužku
        safeAreaInsets: { bottom: 0 }, 

        tabBarIcon: ({ focused }) => {
          let iconName: any = 'help-circle';

          // Nastavení ikonek pro jednotlivé obrazovky
          if (route.name === 'index') {
            iconName = focused ? 'home-variant' : 'home-variant-outline';
          } else if (route.name === 'calendar') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'inventory') {
            iconName = 'medical-bag'; 
          } else if (route.name === 'records') {
            iconName = focused ? 'file' : 'file-outline';
          } else if (route.name === 'user') {
            iconName = focused ? 'account' : 'account-outline';
          }

          return <MaterialCommunityIcons name={iconName} size={32} color={focused ? colors.third : colors.secondary} />;
        },
        
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          position: 'absolute',
          bottom: 24, 
          left: 20,   
          right: 20,  
          height: 64, 
          borderRadius: 32, 
          borderTopWidth: 0, 
          paddingBottom: 0,
          paddingTop: 0,
          
          // Stíny
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
          elevation: 5,
        },
        
        tabBarItemStyle: {
          height: 64,
          justifyContent: 'center', 
          alignItems: 'center',
        },

        tabBarIconStyle: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        },

        tabBarActiveTintColor: colors.third,
        tabBarInactiveTintColor: colors.secondary,
        headerStyle: { backgroundColor: colors.sixth, borderBottomWidth: 0, shadowOpacity: 0, elevation: 0 },
        headerTintColor: colors.sixth,
        headerTitleAlign: 'center',
        headerTitleStyle: { fontSize: 32, fontWeight: 'bold', color: colors.secondary },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Domov', headerShown: false }} />
      <Tabs.Screen name="calendar" options={{ title: 'Kalendář', headerShown: false }} />
      <Tabs.Screen name="inventory" options={{ title: 'Lékárnička', headerShown: false }} />
      <Tabs.Screen name="records" options={{ title: 'Záznamy', headerShown: false }} />
      <Tabs.Screen name="user" options={{ title: 'Účet', headerShown: false }} />
    </Tabs>
  );
}