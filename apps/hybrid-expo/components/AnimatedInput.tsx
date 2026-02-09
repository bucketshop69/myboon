import React, { useState, useEffect, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Clipboard } from 'lucide-react-native';
import * as ClipboardModule from 'expo-clipboard';

interface AnimatedInputProps {
  style?: object;
}

const PLACEHOLDERS = [
  "What's your PnL?",
  "Type transaction hash",
];

const TYPING_SPEED = 100; // ms per character
const ERASING_SPEED = 50; // ms per character
const PAUSE_DURATION = 2000; // ms pause before erasing

export function AnimatedInput({ style }: AnimatedInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [placeholder, setPlaceholder] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<any>(null);

  // Animation logic
  useEffect(() => {
    // Don't animate if user is typing or input is focused
    if (isFocused || inputValue.length > 0) {
      return;
    }

    const currentText = PLACEHOLDERS[currentIndex];

    let timer: NodeJS.Timeout;

    if (isPaused) {
      timer = setTimeout(() => {
        setIsPaused(false);
        setIsTyping(false);
      }, PAUSE_DURATION);
    } else if (isTyping) {
      if (charIndex < currentText.length) {
        timer = setTimeout(() => {
          setPlaceholder(currentText.slice(0, charIndex + 1));
          setCharIndex(charIndex + 1);
        }, TYPING_SPEED);
      } else {
        // Finished typing, pause before erasing
        setIsPaused(true);
      }
    } else {
      // Erasing
      if (charIndex > 0) {
        timer = setTimeout(() => {
          setPlaceholder(currentText.slice(0, charIndex - 1));
          setCharIndex(charIndex - 1);
        }, ERASING_SPEED);
      } else {
        // Finished erasing, move to next placeholder
        const nextIndex = (currentIndex + 1) % PLACEHOLDERS.length;
        setCurrentIndex(nextIndex);
        setIsTyping(true);
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [charIndex, currentIndex, isTyping, isPaused, isFocused, inputValue]);

  const handlePaste = async () => {
    try {
      const text = await ClipboardModule.getStringAsync();
      setInputValue(text);
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Reset animation when unfocused and empty
    if (inputValue.length === 0) {
      setCharIndex(0);
      setPlaceholder('');
      setIsTyping(true);
      setIsPaused(false);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <TextInput
        ref={inputRef}
        value={inputValue}
        onChangeText={setInputValue}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor="#888"
        style={styles.input}
      />
      <TouchableOpacity
        onPress={handlePaste}
        style={styles.pasteButton}
        accessibilityLabel="Paste"
      >
        <Clipboard size={18} color="#888" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 64,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: '#ffffff1a',
    borderRadius: 20,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'monospace',
    color: '#ffffff',
    paddingVertical: 0,
  },
  pasteButton: {
    padding: 8,
    marginLeft: 8,
  },
});