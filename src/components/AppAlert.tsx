import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform, Animated, Easing } from 'react-native';
import { Color, Font, Radius, Shadow, useTheme } from '../constants/theme';

export type AlertType = 'info' | 'success' | 'error' | 'warning';

export type AlertOptions = {
  type?: AlertType;
  title?: string;
  message: string;
  buttonLabel?: string;
  onClose?: () => void;
};

type AlertContextValue = {
  showAlert: (opts: AlertOptions | string) => void;
};

const AlertContext = createContext<AlertContextValue>({ showAlert: () => {} });

export function useAlert() {
  return useContext(AlertContext);
}

// Màu nút (text) theo loại — kiểu iOS, chỉ là chữ màu, không nền.
// Trỏ thẳng vào token thay vì hex lặp: trước đây 4 mã màu này sống riêng một bản,
// đổi palette là chúng lệch lại một mình.
const TYPE_COLOR: Record<AlertType, string> = {
  info: Color.hot,
  success: Color.success,
  error: Color.danger,
  warning: Color.amber,
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const C = useTheme();
  const [visible, setVisible] = useState(false);
  const [opts, setOpts] = useState<AlertOptions>({ message: '' });
  const anim = useRef(new Animated.Value(0)).current;

  const showAlert = useCallback((o: AlertOptions | string) => {
    setOpts(typeof o === 'string' ? { message: o } : o);
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) { anim.setValue(0); return; }
    Animated.timing(anim, {
      toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [visible, anim]);

  const dismiss = useCallback(() => {
    Animated.timing(anim, {
      toValue: 0, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web',
    }).start(() => {
      setVisible(false);
      opts.onClose?.();
    });
  }, [anim, opts]);

  const s = makeStyles(C);
  const btnColor = TYPE_COLOR[opts.type || 'info'];

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
        <View style={s.overlay}>
          <TouchableOpacity style={s.backdrop} onPress={dismiss} activeOpacity={1} />
          <Animated.View
            style={[
              s.card,
              {
                opacity: anim,
                transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) }],
              },
            ]}
          >
            {opts.title ? <Text style={s.title}>{opts.title}</Text> : null}
            <Text style={[s.message, opts.title ? null : s.messageNoTitle]}>{opts.message}</Text>
            <View style={s.btnRow}>
              <TouchableOpacity style={s.btn} onPress={dismiss} activeOpacity={0.6}>
                <Text style={[s.btnText, { color: btnColor }]}>{opts.buttonLabel || 'OK'}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </AlertContext.Provider>
  );
}

type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Color.scrim },
  card: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: Color.card,
    borderRadius: 14,
    overflow: 'hidden',
    ...Shadow.level4,
  },
  title: { fontSize: 17, fontWeight: '700', color: Color.text, textAlign: 'center', marginTop: 22, paddingHorizontal: 20 },
  message: {
    fontSize: 13,
    color: Color.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 20,
  },
  messageNoTitle: { marginTop: 22 },
  btnRow: { flexDirection: 'row', marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Color.border },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  btnText: { fontSize: 16, fontWeight: '600' },
});