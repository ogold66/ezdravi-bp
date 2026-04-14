import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { MaterialCommunityIcons, } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import colors from '@/components/colors';
import { db } from '../../db';
import { inventory, medicationPlans, medicationLogs, users } from '../../db/schema'; 
import { eq, desc } from 'drizzle-orm'; 
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';

export default function InventoryScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [items, setItems] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const storedId = await SecureStore.getItemAsync('activeUserId');
      let currentUserId = storedId ? Number(storedId) : null;

      if (!currentUserId) {
        const allUsers = await db.select().from(users);
        if (allUsers.length > 0) currentUserId = allUsers[0].user_id;
        else return;
      }

      // Načítá a řadí jen krabičky aktuálního uživatele
      const data = await db.select().from(inventory).where(eq(inventory.user_id, currentUserId)).orderBy(desc(inventory.inventory_id)); 
      setItems(data); 
    } catch (error) {
      console.error("Chyba při načítání lékárničky:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const handleDelete = (id: number) => {
    Alert.alert(
      "Vyhodit krabičku úplně",
      "Opravdu chcete tuto krabičku trvale smazat z databáze? Tuto možnost použijte pouze pokud jste krabičku vytvořili omylem.",
      [
        { text: "Zrušit", style: "cancel" },
        { 
          text: "Smazat úplně", 
          style: "destructive", 
          onPress: async () => {
            try {
              const plans = await db.select().from(medicationPlans).where(eq(medicationPlans.inventory_id, id));
              const logs = await db.select().from(medicationLogs).where(eq(medicationLogs.inventory_id, id));
              
              if (plans.length > 0 || logs.length > 0) {
                Alert.alert(
                  "Nelze smazat", 
                  "Z této krabičky už se v minulosti braly léky, nebo je napojená na aktuální plán. Úplným smazáním byste si rozbili historii užívání.\n\nPokud je krabička prázdná, klikněte na ni a zvolte 'Vyřadit do historie'."
                );
                return;
              }
              
              await db.delete(inventory).where(eq(inventory.inventory_id, id));
              loadData();
            } catch (e) {
              Alert.alert("Chyba", "Nepodařilo se krabičku smazat.");
            }
          }
        }
      ]
    );
  };

  const handleQuickArchive = (id: number) => {
    Alert.alert(
      "Vyřadit krabičku",
      "Krabička je prázdná. Chcete ji přesunout z Aktuálních do Historie?",
      [
        { text: "Zrušit", style: "cancel" },
        { 
          text: "Vyřadit", 
          style: "default", 
          onPress: async () => {
            try {
              await db.update(inventory).set({ status: 'DEPLETED', depleted_at: new Date().toISOString() }).where(eq(inventory.inventory_id, id));
              loadData();
            } catch (e) {}
          }
        }
      ]
    );
  };

  const renderRightActions = (id: number) => {
    return (
      <TouchableOpacity style={styles.deleteAction} activeOpacity={0.8} onPress={() => handleDelete(id)}>
        <MaterialCommunityIcons name="trash-can-outline" size={28} color="#FFF" />
        <Text style={styles.deleteActionText}>Smazat</Text>
      </TouchableOpacity>
    );
  };

  const currentData = items.filter(item => 
    activeTab === 'ACTIVE' ? item.status === 'ACTIVE' : item.status === 'DEPLETED'
  );

  const renderItem = ({ item }: { item: any }) => {
    const isArchived = item.status === 'DEPLETED'; 
    const isExpired = item.expiration_date && new Date(item.expiration_date) < new Date(new Date().setHours(0,0,0,0));
    const isEmpty = item.remaining_qty <= 0;

    return (
      <Swipeable renderRightActions={() => renderRightActions(item.inventory_id)}>
        <TouchableOpacity 
          style={[styles.card, isArchived && styles.cardDepleted, (isEmpty && !isArchived) && { borderColor: '#FFCDD2', borderWidth: 1 }]} 
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/inventory-detail', params: { id: item.inventory_id } })}
        >
          <View style={[styles.iconBox, { backgroundColor: isArchived ? '#F5F5F5' : (isEmpty ? '#FFF5F5' : '#E8F5E9') }]}>
            <MaterialCommunityIcons name={item.form === 'SYRUP' ? 'medication' : 'pill'} size={28} color={isArchived ? '#CCC' : (isEmpty ? '#FF5252' : (colors.third || '#4CAF50'))} />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, isArchived && { color: '#888' }]}>{item.medication_name}</Text>
            <Text style={[styles.cardSub, (isEmpty && !isArchived) && { color: '#FF5252', fontWeight: 'bold' }]}>
              {isArchived ? 'Vyřazeno / Archivováno' : (isEmpty ? '⚠️ Prázdná krabička' : `Zbývá: ${item.remaining_qty} z ${item.total_qty} ${item.unit}`)}
            </Text>
            {item.expiration_date && (
              <Text style={[styles.cardExp, isExpired && !isArchived && { color: '#FF5252', fontWeight: 'bold' }, isArchived && { color: '#CCC' }]}>
                {isExpired && !isArchived ? '⚠️ Prošlo: ' : 'Expirace: '}
                {new Date(item.expiration_date).toLocaleDateString('cs-CZ')}
              </Text>
            )}
          </View>
          {(!isArchived && isEmpty) ? (
             <TouchableOpacity style={{ backgroundColor: '#FF5252', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, justifyContent: 'center' }} onPress={(e) => { e.stopPropagation(); handleQuickArchive(item.inventory_id); }}>
                <Text style={{ color: '#FFF', fontSize: 12, fontWeight: 'bold' }}>Vyřadit</Text>
             </TouchableOpacity>
          ) : (
             <MaterialCommunityIcons name="chevron-right" size={24} color="#CCC" style={{ alignSelf: 'center' }} />
          )}
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}><Text style={styles.title}>Lékárnička</Text></View>
        <View style={styles.topTabs}>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'ACTIVE' && styles.tabActive]} onPress={() => setActiveTab('ACTIVE')}><Text style={[styles.tabText, activeTab === 'ACTIVE' && styles.tabTextActive]}>Aktuální</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, activeTab === 'HISTORY' && styles.tabActive]} onPress={() => setActiveTab('HISTORY')}><Text style={[styles.tabText, activeTab === 'HISTORY' && styles.tabTextActive]}>Historie</Text></TouchableOpacity>
        </View>
        <FlatList
          data={currentData}
          keyExtractor={(item) => item.inventory_id.toString()}
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="medical-bag" size={48} color="#E0E0E0" />
              <Text style={styles.emptyText}>{activeTab === 'ACTIVE' ? 'Tvá lékárnička je zatím prázdná.\nPřidej si krabičku.' : 'Zatím tu nejsou žádné vyřazené léky.'}</Text>
            </View>
          }
        />
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/add-inventory')} activeOpacity={0.8}><MaterialCommunityIcons name="plus" size={32} color="#FFF" /></TouchableOpacity>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFA' }, header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 }, title: { fontSize: 32, fontWeight: 'bold', color: '#111' }, topTabs: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 10 }, tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 20, backgroundColor: '#EEE' }, tabActive: { backgroundColor: colors.third }, tabText: { fontWeight: 'bold', color: '#888' }, tabTextActive: { color: '#FFF' }, card: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5 }, cardDepleted: { backgroundColor: '#FAFAFA', elevation: 0, borderWidth: 1, borderColor: '#EEE' }, iconBox: { width: 50, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 }, cardText: { flex: 1, justifyContent: 'center' }, cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' }, cardSub: { fontSize: 13, color: '#888', marginTop: 4 }, cardExp: { fontSize: 11, color: '#AAA', marginTop: 4 }, deleteAction: { backgroundColor: '#FF5252', justifyContent: 'center', alignItems: 'center', width: 90, borderRadius: 16, marginBottom: 12, marginLeft: 10, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 5 }, deleteActionText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginTop: 4 }, emptyState: { alignItems: 'center', marginTop: 50 }, emptyText: { color: '#AAA', marginTop: 15, textAlign: 'center', lineHeight: 22 }, fab: { position: 'absolute', right: 20, bottom: 100, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.third, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 5 }
});