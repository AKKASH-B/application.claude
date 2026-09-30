import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from './constants';

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface NotesTabProps {
  // Notes would typically be fetched from backend or AsyncStorage
  // For now, we'll keep them in component state
}

export const NotesTab: React.FC<NotesTabProps> = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const generateId = () => '_' + Math.random().toString(36).substr(2, 9);

  const getCurrentTime = () => new Date().toISOString();

  const openNewNote = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setModalVisible(true);
  };

  const openEditNote = (note: Note) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setModalVisible(true);
  };

  const saveNote = () => {
    if (!title.trim() && !content.trim()) {
      Alert.alert('Empty Note', 'Please add a title or content to save this note.');
      return;
    }

    const now = getCurrentTime();

    if (editingNote) {
      // Update existing note
      setNotes((prevNotes) =>
        prevNotes.map((note) =>
          note.id === editingNote.id
            ? {
                ...note,
                title: title || 'Untitled',
                content,
                updated_at: now,
              }
            : note
        )
      );
    } else {
      // Create new note
      const newNote: Note = {
        id: generateId(),
        title: title || 'Untitled',
        content,
        created_at: now,
        updated_at: now,
      };
      setNotes((prevNotes) => [newNote, ...prevNotes]);
    }

    closeModal();
  };

  const deleteNote = (noteId: string) => {
    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Delete',
        onPress: () => {
          setNotes((prevNotes) => prevNotes.filter((n) => n.id !== noteId));
        },
        style: 'destructive',
      },
    ]);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingNote(null);
    setTitle('');
    setContent('');
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const getPreview = (content: string): string => {
    return content.split('\n')[0].substring(0, 60);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notes</Text>
          <Text style={styles.subtitle}>Keep track of your thoughts</Text>
        </View>
        <Pressable onPress={openNewNote} style={styles.createNoteBtn}>
          <Text style={styles.createNoteBtnText}>Create Notes</Text>
        </Pressable>
      </View>

      {notes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="feather" size={48} color={COLORS.gray} />
          <Text style={styles.emptyTitle}>No Notes Yet</Text>
          <Text style={styles.emptyText}>Create your first note to get started</Text>
          <Pressable onPress={openNewNote} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>Create Notes</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={styles.notesList} showsVerticalScrollIndicator={false}>
          {notes.map((note) => (
            <Pressable
              key={note.id}
              onPress={() => openEditNote(note)}
              style={({ pressed }) => [styles.noteCard, pressed && styles.noteCardPressed]}
            >
              <View style={styles.noteCardLeft}>
                <Text style={styles.noteTitle} numberOfLines={2}>
                  {note.title}
                </Text>
                {note.content && (
                  <Text style={styles.notePreview} numberOfLines={2}>
                    {getPreview(note.content)}
                  </Text>
                )}
                <Text style={styles.noteDate}>{formatDate(note.updated_at)}</Text>
              </View>
              <Pressable
                onPress={() => deleteNote(note.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
              >
                <Feather name="trash-2" size={18} color={COLORS.gray} />
              </Pressable>
            </Pressable>
          ))}
          <View style={styles.spacing} />
        </ScrollView>
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
          <View style={styles.modalOverlay} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Pressable onPress={closeModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={24} color={COLORS.dark} />
              </Pressable>
              <Text style={styles.modalTitle}>{editingNote ? 'Edit Note' : 'New Note'}</Text>
              <Pressable onPress={saveNote} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="check" size={24} color={COLORS.green} />
              </Pressable>
            </View>

            <TextInput
              placeholder="Title"
              placeholderTextColor={COLORS.gray}
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
            />

            <TextInput
              placeholder="Start typing..."
              placeholderTextColor={COLORS.gray}
              style={styles.contentInput}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />

            {editingNote && (
              <View style={styles.noteMetadata}>
                <Text style={styles.metadataText}>
                  Created: {new Date(editingNote.created_at).toLocaleDateString()}
                </Text>
                <Text style={styles.metadataText}>
                  Updated: {new Date(editingNote.updated_at).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.gray,
  },
  createNoteBtn: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  createNoteBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.dark,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.green,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  notesList: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  noteCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  noteCardPressed: {
    backgroundColor: '#f3f4f6',
  },
  noteCardLeft: {
    flex: 1,
    marginRight: 12,
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.dark,
  },
  notePreview: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 4,
  },
  noteDate: {
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 6,
  },
  deleteBtn: {
    padding: 8,
  },
  spacing: {
    height: 40,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.green,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  fabPressed: {
    opacity: 0.8,
  },
  modalContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
    paddingTop: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },
  titleInput: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.dark,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  contentInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.dark,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  noteMetadata: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
  },
  metadataText: {
    fontSize: 11,
    color: COLORS.gray,
    lineHeight: 16,
  },
});
