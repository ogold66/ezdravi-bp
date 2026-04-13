import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router'; 
import colors from './colors'; 
import { db } from '../db';
import { medicationLogs, medicationPlans, inventory } from '../db/schema';
import { eq, and } from 'drizzle-orm';

interface Dose {
  time: string;
  amount: number;
}

interface Schedule {
  days: string[];
  doses: Dose[];
}

interface MedicationCardProps {
  medicationId: number; 
  inventoryId: number; // <--- PŘIDÁNO
  name: string;
  remaining: number;  
  unit: string;       
  form: string;
  dosesConfig: string; 
  diseaseName?: string;
  onUpdate?: () => void; 
}

export default function MedicationCard({ medicationId, inventoryId, name, remaining, unit, form, dosesConfig, diseaseName, onUpdate }: MedicationCardProps) {
  
  const router = useRouter();
  const [takenTimes, setTakenTimes] = useState<string[]>([]);
  
  const todayDay = (new Date().getDay() || 7).toString(); 
  const schedules: Schedule[] = JSON.parse(dosesConfig || '[]');
  
  const dosesArray: Dose[] = schedules
    .filter(s => s.days.includes(todayDay))
    .flatMap(s => s.doses)
    .sort((a, b) => a.time.localeCompare(b.time)); 

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const fetchTodayLogs = async () => {
      try {
        const logs = await db.select().from(medicationLogs).where(
          and(
            eq(medicationLogs.plan_id, medicationId), 
            eq(medicationLogs.scheduled_date, todayStr), 
            eq(medicationLogs.status, 'TAKEN')
          )
        );
        setTakenTimes(logs.map(l => l.scheduled_time as string));
      } catch (error) {
        console.error("Chyba při načítání logů:", error);
      }
    };
    fetchTodayLogs();
  }, [medicationId, todayStr]);

  const handleEmptyBoxClick = () => {
      Alert.alert(
        'Prázdná krabička!', 
        `Lék ${name} už došel. Chcete prázdnou krabičku rovnou vyřadit do historie a vybrat z lékárničky novou?`,
        [
          { text: 'Zrušit', style: 'cancel' },
          { 
            text: 'Vyřadit a změnit zdroj', 
            style: 'default',
            onPress: async () => {
              await db.update(inventory).set({ status: 'DEPLETED', depleted_at: new Date().toISOString() }).where(eq(inventory.inventory_id, inventoryId));
              router.push({ pathname: '/medication-detail', params: { id: medicationId } });
            }
          }
        ]
      );
  };

  const toggleDose = async (dose: Dose) => {
    const isCurrentlyTaken = takenTimes.includes(dose.time);
    
    try {
      const planData = await db.select().from(medicationPlans).where(eq(medicationPlans.plan_id, medicationId));
      if (planData.length === 0) return;
      const currentInvId = planData[0].inventory_id;

      if (isCurrentlyTaken) {
        const existingLogs = await db.select().from(medicationLogs).where(
          and(
            eq(medicationLogs.plan_id, medicationId),
            eq(medicationLogs.scheduled_date, todayStr),
            eq(medicationLogs.scheduled_time, dose.time)
          )
        );

        if (existingLogs.length > 0) {
          const logToDelete = existingLogs[0];
          await db.delete(medicationLogs).where(eq(medicationLogs.log_id, logToDelete.log_id));
          
          const targetInv = await db.select().from(inventory).where(eq(inventory.inventory_id, logToDelete.inventory_id));
          if (targetInv.length > 0) {
            await db.update(inventory)
              .set({ remaining_qty: targetInv[0].remaining_qty + logToDelete.amount })
              .where(eq(inventory.inventory_id, logToDelete.inventory_id));
          }
        }

        setTakenTimes(prev => prev.filter(t => t !== dose.time));
        if (onUpdate) onUpdate();

      } else {
        if (remaining < dose.amount) {
          handleEmptyBoxClick(); // Použijeme stejnou logiku jako tlačítko
          return; 
        }

        await db.insert(medicationLogs).values({
          plan_id: medicationId,
          inventory_id: currentInvId, 
          scheduled_date: todayStr,
          scheduled_time: dose.time,
          taken_at: new Date().toISOString(),
          amount: dose.amount,
          status: 'TAKEN'
        });

        await db.update(inventory)
          .set({ remaining_qty: remaining - dose.amount })
          .where(eq(inventory.inventory_id, currentInvId));

        setTakenTimes(prev => [...prev, dose.time]);
        if (onUpdate) onUpdate(); 
      }
      
    } catch (error) {
      console.error("Chyba při aktualizaci stavu:", error);
    }
  };

  const handleDelete = () => {
    Alert.alert("Smazat režim", `Opravdu chceš smazat plán pro ${name}? (Lék ti v Lékárničce zůstane.)`, [
      { text: "Zrušit", style: "cancel" },
      { text: "Smazat", style: "destructive", onPress: async () => {
          await db.delete(medicationLogs).where(eq(medicationLogs.plan_id, medicationId));
          await db.delete(medicationPlans).where(eq(medicationPlans.plan_id, medicationId));
          if (onUpdate) onUpdate();
      }}
    ]);
  };

  const getIconName = () => (form === 'SYRUP' ? 'medication-outline' : 'pill-multiple');
  const isEmpty = remaining <= 0;

  return (
    <View style={[styles.cardContainer, isEmpty && { borderColor: '#FFEBEB', borderWidth: 1 }]}>
      <TouchableOpacity style={styles.topSection} onLongPress={handleDelete} activeOpacity={0.6}>
        <View style={[styles.iconBox, isEmpty && { backgroundColor: '#F5F5F5' }]}>
          <MaterialCommunityIcons name={getIconName()} size={32} color={isEmpty ? '#AAA' : colors.secondary} />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.title, isEmpty && { color: '#888' }]}>{name}</Text>
          <Text style={[styles.infoLine, { color: isEmpty ? '#AAA' : colors.third, fontWeight: '600', marginTop: 2 }]}>
            {diseaseName ? `🩺 Na: ${diseaseName}` : '🛡️ Preventivní'}
          </Text>
          <Text style={[styles.infoLine, isEmpty && { color: '#FF5252', fontWeight: 'bold' }]}>
            <Text style={[styles.infoLabel, isEmpty && { color: '#FF5252' }]}>
              {isEmpty ? '⚠️ Došly zásoby: ' : 'V lékárničce zbývá: '}
            </Text>
            {remaining} {unit}
          </Text>
        </View>
      </TouchableOpacity>

      {/* ZOBRAZENÍ DÁVEK NEBO TLAČÍTKA PRO VÝMĚNU */}
      <View style={styles.bottomSection}>
        {isEmpty ? (
           // --- NOVÝ BUTTON PRO PRÁZDNOU KRABIČKU ---
           <TouchableOpacity 
             style={{ flexDirection: 'row', backgroundColor: '#F5F5F5', paddingVertical: 12, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flex: 1, gap: 8, borderWidth: 1, borderColor: '#EEE' }} 
             onPress={handleEmptyBoxClick}
             activeOpacity={0.7}
           >
             <MaterialCommunityIcons name="archive-outline" size={20} color="#888" />
             <Text style={{ color: '#888', fontSize: 15, fontWeight: 'bold' }}>Vyřadit a změnit</Text>
           </TouchableOpacity>
        ) : (
          dosesArray.length > 0 && dosesArray.map((dose, index) => {
            const isTaken = takenTimes.includes(dose.time);
            return (
              <TouchableOpacity 
                key={index}
                style={[
                  styles.checkPill, 
                  isTaken && styles.checkPillTaken,
                ]} 
                onPress={() => toggleDose(dose)} 
              >
                {isTaken && <MaterialCommunityIcons name="check" size={16} color="white" />}
                <Text style={[
                  styles.checkPillText, 
                  isTaken && styles.checkPillTextTaken,
                ]}>
                  {dose.time} ({dose.amount} {unit})
                </Text>
              </TouchableOpacity>
            )
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginVertical: 8, marginHorizontal: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 4 },
  topSection: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { backgroundColor: '#E8F5E9', padding: 14, borderRadius: 16, marginRight: 16 },
  textContainer: { flex: 1 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111' },
  infoLine: { fontSize: 14, color: '#333', marginTop: 4 },
  infoLabel: { color: '#888' },
  bottomSection: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderColor: '#F0F0F0', marginTop: 16, paddingTop: 16, gap: 10 },
  checkPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 38, borderRadius: 19, backgroundColor: '#F5F5F5', gap: 6 },
  checkPillTaken: { backgroundColor: colors.third },
  checkPillText: { fontSize: 14, fontWeight: '600', color: '#666' },
  checkPillTextTaken: { color: '#FFF' }
});