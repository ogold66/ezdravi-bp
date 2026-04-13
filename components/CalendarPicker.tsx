import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import type { MarkedDates } from 'react-native-calendars/src/types';
import { MaterialCommunityIcons } from '@expo/vector-icons';

LocaleConfig.locales['cs'] = {
  monthNames: ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'],
  monthNamesShort: ['Led','Úno','Bře','Dub','Kvě','Čvn','Čvc','Srp','Zář','Říj','Lis','Pro'],
  dayNames: ['Neděle','Pondělí','Úterý','Středa','Čtvrtek','Pátek','Sobota'],
  dayNamesShort: ['Ne','Po','Út','St','Čt','Pá','So'],
  today: 'Dnes',
};
LocaleConfig.defaultLocale = 'cs';

const MONTHS = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];

const parseYM = (s: string) => ({
  year: parseInt(s.substring(0, 4)),
  month: parseInt(s.substring(5, 7)) - 1, // 0-indexed
});

interface Props {
  visible: boolean;
  title: string;
  currentDate: string;       // YYYY-MM-DD
  markedDates?: MarkedDates;
  onDayPress: (day: { dateString: string }) => void;
  onClose: () => void;
  minDate?: string;          // YYYY-MM-DD
  maxDate?: string;          // YYYY-MM-DD
  themeColor?: string;
  deleteLabel?: string;
  onDelete?: () => void;
}

export default function CalendarPicker({
  visible, title, currentDate, markedDates, onDayPress, onClose,
  minDate = '1990-01-01', maxDate = '2100-12-31',
  themeColor = '#4CAF50', deleteLabel, onDelete,
}: Props) {

  const minYM = parseYM(minDate);
  const maxYM = parseYM(maxDate);

  // Pouze roky v povoleném rozsahu
  const YEARS = Array.from(
    { length: maxYM.year - minYM.year + 1 },
    (_, i) => minYM.year + i
  );

  const [displayedMonth, setDisplayedMonth] = useState(currentDate.substring(0, 7));
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(parseInt(currentDate.substring(0, 4)));
  const [pickerMonth, setPickerMonth] = useState(parseInt(currentDate.substring(5, 7)) - 1);
  const yearScrollRef = useRef<ScrollView>(null);

  // Ořízne YYYY-MM do dovoleného rozsahu
  const clampYM = (ym: string): string => {
    const y = parseInt(ym.substring(0, 4));
    const m = parseInt(ym.substring(5, 7)) - 1;
    if (y < minYM.year || (y === minYM.year && m < minYM.month))
      return `${minYM.year}-${(minYM.month + 1).toString().padStart(2, '0')}`;
    if (y > maxYM.year || (y === maxYM.year && m > maxYM.month))
      return `${maxYM.year}-${(maxYM.month + 1).toString().padStart(2, '0')}`;
    return ym;
  };

  useEffect(() => {
    if (visible) {
      setDisplayedMonth(clampYM(currentDate.substring(0, 7)));
      setShowMonthYearPicker(false);
    }
  }, [visible, minDate, maxDate]);

  const displayedYear = parseInt(displayedMonth.substring(0, 4));
  const displayedMonthIdx = parseInt(displayedMonth.substring(5, 7)) - 1;

  const canGoBack = !(displayedYear === minYM.year && displayedMonthIdx === minYM.month);
  const canGoForward = !(displayedYear === maxYM.year && displayedMonthIdx === maxYM.month);

  const goBack = () => {
    if (!canGoBack) return;
    const d = new Date(displayedYear, displayedMonthIdx - 1, 1);
    setDisplayedMonth(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
  };

  const goForward = () => {
    if (!canGoForward) return;
    const d = new Date(displayedYear, displayedMonthIdx + 1, 1);
    setDisplayedMonth(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
  };

  const openMonthYearPicker = () => {
    setPickerYear(displayedYear);
    setPickerMonth(displayedMonthIdx);
    setShowMonthYearPicker(true);
    // Scrollni na aktuální rok
    setTimeout(() => {
      const idx = YEARS.indexOf(displayedYear);
      if (idx > 0) yearScrollRef.current?.scrollTo({ x: idx * 58, animated: false });
    }, 60);
  };

  // Vrátí true pokud je měsíc nedostupný pro zvolený pickerYear
  const isMonthDisabled = (monthIdx: number): boolean => {
    if (pickerYear === minYM.year && monthIdx < minYM.month) return true;
    if (pickerYear === maxYM.year && monthIdx > maxYM.month) return true;
    return false;
  };

  const handlePickerYearChange = (y: number) => {
    setPickerYear(y);
    // Pokud vybraný měsíc není dostupný v novém roce, přesuň ho na nejbližší povolený
    if (y === minYM.year && pickerMonth < minYM.month) setPickerMonth(minYM.month);
    if (y === maxYM.year && pickerMonth > maxYM.month) setPickerMonth(maxYM.month);
  };

  const confirmMonthYear = () => {
    // Zaclipni měsíc pro jistotu
    let m = pickerMonth;
    if (pickerYear === minYM.year && m < minYM.month) m = minYM.month;
    if (pickerYear === maxYM.year && m > maxYM.month) m = maxYM.month;
    setDisplayedMonth(`${pickerYear}-${(m + 1).toString().padStart(2, '0')}`);
    setShowMonthYearPicker(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.container} onStartShouldSetResponder={() => true}>

          {/* HLAVIČKA MODALU */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
              {deleteLabel && onDelete && (
                <TouchableOpacity onPress={() => { onDelete(); onClose(); }}>
                  <Text style={{ color: '#FF5252', fontWeight: 'bold', fontSize: 15 }}>{deleteLabel}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
          </View>

          {/* NAVIGAČNÍ HLAVIČKA KALENDÁŘE */}
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={goBack} style={{ padding: 6 }}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={canGoBack ? '#555' : '#DDD'} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.calHeaderCenter} onPress={openMonthYearPicker} activeOpacity={0.7}>
              <Text style={[styles.calHeaderText, { color: themeColor }]}>
                {MONTHS[displayedMonthIdx]} {displayedYear}
              </Text>
              <MaterialCommunityIcons name="menu-down" size={20} color={themeColor} />
            </TouchableOpacity>
            <TouchableOpacity onPress={goForward} style={{ padding: 6 }}>
              <MaterialCommunityIcons name="chevron-right" size={24} color={canGoForward ? '#555' : '#DDD'} />
            </TouchableOpacity>
          </View>

          {/* KALENDÁŘ */}
          <Calendar
            key={`cal-${displayedMonth}`}
            current={`${displayedMonth}-01`}
            markedDates={markedDates}
            onDayPress={onDayPress}
            minDate={minDate}
            maxDate={maxDate}
            firstDay={1}
            hideArrows={true}
            renderHeader={() => null}
            theme={{
              selectedDayBackgroundColor: themeColor,
              todayTextColor: themeColor,
              arrowColor: themeColor,
            }}
          />
        </View>
      </TouchableOpacity>

      {/* POPUP – výběr měsíce a roku */}
      <Modal visible={showMonthYearPicker} transparent animationType="fade" onRequestClose={() => setShowMonthYearPicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowMonthYearPicker(false)}>
          <View style={styles.pickerCard} onStartShouldSetResponder={() => true}>

            <Text style={styles.pickerTitle}>Vybrat měsíc a rok</Text>

            {/* MŘÍŽKA MĚSÍCŮ – nedostupné jsou zašedlé a neklikatelné */}
            <View style={styles.monthGrid}>
              {MONTHS.map((m, i) => {
                const disabled = isMonthDisabled(i);
                const selected = pickerMonth === i;
                return (
                  <TouchableOpacity
                    key={i}
                    disabled={disabled}
                    style={[
                      styles.monthBtn,
                      selected && { backgroundColor: themeColor },
                      disabled && styles.monthBtnDisabled,
                    ]}
                    onPress={() => setPickerMonth(i)}
                  >
                    <Text style={[
                      styles.monthBtnText,
                      selected && { color: '#FFF', fontWeight: 'bold' },
                      disabled && { color: '#CCC' },
                    ]}>
                      {m.substring(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* HORIZONTÁLNÍ SCROLL ROKŮ – pouze roky v rozsahu minDate–maxDate */}
            <ScrollView
              ref={yearScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.yearList}
            >
              {YEARS.map(y => (
                <TouchableOpacity
                  key={y}
                  style={[styles.yearBtn, pickerYear === y && { backgroundColor: themeColor }]}
                  onPress={() => handlePickerYearChange(y)}
                >
                  <Text style={[styles.yearBtnText, pickerYear === y && { color: '#FFF', fontWeight: 'bold' }]}>
                    {y}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* POTVRZENÍ */}
            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: themeColor }]} onPress={confirmMonthYear}>
              <Text style={styles.confirmBtnText}>Přejít na {MONTHS[pickerMonth]} {pickerYear}</Text>
            </TouchableOpacity>

          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  container: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 12 },
  calHeaderCenter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  calHeaderText: { fontSize: 16, fontWeight: 'bold' },
  pickerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, width: '88%', maxWidth: 360 },
  pickerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111', marginBottom: 16, textAlign: 'center' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  monthBtn: { width: '22%', paddingVertical: 8, borderRadius: 10, backgroundColor: '#F3F3F3', alignItems: 'center' },
  monthBtnDisabled: { backgroundColor: '#F8F8F8' },
  monthBtnText: { fontSize: 13, color: '#444' },
  yearList: { flexDirection: 'row', gap: 8, paddingVertical: 4, marginBottom: 20 },
  yearBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F3F3F3' },
  yearBtnText: { fontSize: 14, color: '#444' },
  confirmBtn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
});