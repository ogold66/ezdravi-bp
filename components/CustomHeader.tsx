import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import BackIcon from '@/assets/svg/backIcon.svg';
import AddButton from '@/assets/svg/addButton.svg';
import colors from '@/components/colors';

interface CustomHeaderProps {
    title: string;
    onBackPress: () => void;
    onAddPress: () => void;
}

const CustomHeader: React.FC<CustomHeaderProps> = ({ title, onBackPress, onAddPress }) => {
    const router = useRouter();

    return (
        <View style={styles.headerContainer}>
            <View style={styles.sideContainer}>
                <TouchableOpacity onPress={onBackPress} style={styles.iconButton}>
                    <BackIcon width={24} height={24} fill={colors.sixth} />
                </TouchableOpacity>
            </View>

            <Text style={styles.headerTitle}>{title}</Text>

            <View style={styles.sideContainer}>
                <TouchableOpacity onPress={onAddPress} style={styles.iconButton}>
                    <View style={styles.addButtonContainer}>
                        <AddButton width={24} height={24} />
                    </View>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    headerContainer: {
        height: 100,
        backgroundColor: colors.sixth,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 54,
        paddingHorizontal: 24,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: 'bold',
        color: colors.secondary,
        textAlign: 'center',
    },
    sideContainer: {
        width: 50, // Šířka odpovídající šířce ikony
        alignItems: 'center',
    },
    iconButton: {
        padding: 8,
    },
    addButtonContainer: {
        width: 50,
        height: 50,
        borderRadius: 21,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
});


export default CustomHeader;
