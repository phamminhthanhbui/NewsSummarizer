import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform, Dimensions, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Hls from 'hls.js';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { VideoItem } from '../types';
import { Color, Font, Radius, Shadow, useTheme } from '../constants/theme';
import { SOURCE_COLORS } from '../services/feeds';
import { getProxyBase } from '../utils/proxy';

interface Props { video: VideoItem; onClose: () => void; }

// Web: Chrome KHÔNG chơi HLS native → hls.js phát qua proxy /api/hls
// (CDN vnecdn chặn browser gọi segment trực tiếp, 407/406 theo Referer).
// Stream mp4 (Kenh14/Soha) phát bằng <video> thường qua cùng proxy — server
// chuyển tiếp kèm Range nên seek được.
function WebVideoPlayer({ stream, width, height }: { stream: string; width: number; height: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isHls = /\.m3u8(\?|$)/i.test(stream);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const src = `${getProxyBase()}/api/hls?url=${encodeURIComponent(stream)}`;
    if (isHls) {
      let hls: Hls | null = null;
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src; // Safari chơi HLS native
      }
      video.play().catch(() => {}); // autoplay có thể bị chặn → user bấm play qua controls
      return () => { if (hls) hls.destroy(); };
    }
    video.src = src; // mp4: <video> phát trực tiếp qua proxy
    video.play().catch(() => {});
  }, [stream, isHls]);
  return (
    <video
      ref={videoRef}
      controls
      playsInline
      style={{ width, height, backgroundColor: '#000' }}
    />
  );
}

// Native: expo-video chơi cả HLS lẫn mp4, nhưng LUÔN đi qua proxy /api/hls —
// một số CDN (vnecdn) chặn request không có Referer đúng (native player không
// tự gửi được); proxy gắn hộ. Playlist rewrite URL segment về relative nên
// player resolve theo base proxy, mọi nguồn phát đồng nhất.
function NativeVideoPlayer({ stream, width, height }: { stream: string; width: number; height: number }) {
  const src = `${getProxyBase()}/api/hls?url=${encodeURIComponent(stream)}`;
  const player = useVideoPlayer(src, (p) => { p.loop = false; p.play(); });
  return (
    <VideoView
      player={player}
      style={{ width, height, backgroundColor: '#000' }}
      nativeControls
      playsInline
    />
  );
}

// Popup phát video nổi bật ngay trong app. Video có stream (VNExpress HLS m3u8,
// Kenh14/Soha mp4) phát trực tiếp qua proxy; video KHÔNG có stream (CDN chặn,
// crawl lấy hụt) hiện thumb + nút mở tại nguồn thay vì nhảy thẳng ra browser.
// Chỉ mount khi có video → hooks ổn định.
export default function VideoModal({ video, onClose }: Props) {
  const C = useTheme();
  const styles = makeStyles(C); // styles động theo dark mode
  const srcColor = SOURCE_COLORS[video.source] || C.hot;
  const w = Math.min(Dimensions.get('window').width - 40, 640);
  const h = Math.round((w * 9) / 16);
  const playable = !!video.stream;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} accessibilityLabel="Đóng video" />
        <View style={[styles.box, Shadow.level4]}>
          {/* Header màu thương hiệu nguồn (SOURCE_COLORS) */}
          <View style={[styles.header, { backgroundColor: srcColor }]}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name="videocam" size={13} color={srcColor} />
              </View>
              <Text style={styles.headerSource} numberOfLines={1}>{video.source}</Text>
              {video.duration ? (
                <View style={styles.headerDur}>
                  <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.headerDurText}>{video.duration}</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity style={styles.headerClose} onPress={onClose} activeOpacity={0.7} accessibilityLabel="Đóng">
              <Ionicons name="close" size={18} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Player hoặc thumb fallback */}
          {playable ? (
            Platform.OS === 'web'
              ? <WebVideoPlayer stream={video.stream || ''} width={w} height={h} />
              : <NativeVideoPlayer stream={video.stream || ''} width={w} height={h} />
          ) : (
            <TouchableOpacity style={{ width: w, height: h }} onPress={() => Linking.openURL(video.link)} activeOpacity={0.85} accessibilityLabel="Mở video tại nguồn">
              {video.thumb ? (
                <Image source={{ uri: video.thumb }} style={{ width: w, height: h }} resizeMode="cover" />
              ) : (
                <View style={{ width: w, height: h, backgroundColor: C.skeleton, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="videocam-outline" size={40} color={C.textMuted} />
                </View>
              )}
              <View style={styles.thumbScrim} />
              <View style={[styles.thumbPlay, { backgroundColor: srcColor }]}>
                <Ionicons name="play" size={24} color="#FFF" />
              </View>
              <View style={styles.thumbNote}>
                <Text style={styles.thumbNoteText}>Video phát tại nguồn (CDN chặn phát trực tiếp)</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Body */}
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={3}>{video.title}</Text>
            {video.zone ? <Text style={styles.zone} numberOfLines={1}>{video.zone}</Text> : null}
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: srcColor }]} onPress={() => Linking.openURL(video.link)} activeOpacity={0.85}>
                <Ionicons name="open-outline" size={15} color="#FFF" />
                <Text style={styles.primaryText}>Mở tại nguồn</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.ghostText}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Palette truyền vào làm shadow biến `Color` cục bộ → styles tự nhận màu dark/light
type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Color.scrim, alignItems: 'center', justifyContent: 'center', padding: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  box: { backgroundColor: Color.card, borderRadius: Radius.lg, overflow: 'hidden', maxWidth: 664, width: '100%' },
  // Header thương hiệu
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  headerIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  headerSource: { fontSize: Font.body, fontWeight: '800', color: '#FFF', letterSpacing: 0.3, flexShrink: 1 },
  headerDur: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.22)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  headerDurText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  headerClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.22)', alignItems: 'center', justifyContent: 'center' },
  // Thumb fallback (video không phát in-app được)
  thumbScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  thumbPlay: {
    position: 'absolute', top: '50%', left: '50%', marginTop: -30, marginLeft: -30,
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbNote: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10, backgroundColor: 'rgba(0,0,0,0.55)' },
  thumbNoteText: { fontSize: Font.tiny, color: '#FFF', textAlign: 'center' },
  // Body
  body: { padding: 14 },
  title: { fontSize: Font.title, fontWeight: '800', color: Color.text, lineHeight: 25 },
  zone: { fontSize: Font.caption, color: Color.textMuted, marginTop: 5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: Radius.sm, paddingVertical: 10,
  },
  primaryText: { fontSize: Font.body, fontWeight: '800', color: '#FFF' },
  ghostBtn: {
    borderWidth: 1, borderColor: Color.border, borderRadius: Radius.sm,
    paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
  },
  ghostText: { fontSize: Font.body, fontWeight: '700', color: Color.textSecondary },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const styles = makeStyles(Color);
