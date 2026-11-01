import type { AuthError } from '@supabase/supabase-js';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CardStack } from '@/components/card-stack';
import { HoloCard } from '@/components/holo-card';
import { LiloMoodArt } from '@/components/lilo';
import { colors, fonts } from '@/constants/fm-theme';
import { supabase } from '@/lib/supabase';

type Mode = 'new' | 'back';
type Message = { kind: 'error' | 'info'; text: string } | null;

const CARDS = [
  {
    mode: 'new' as const,
    label: 'NEW PLAYER',
    stat: 'LV 1',
    title: 'Create account',
    subtitle: 'Start your streak!',
    tint: colors.holoPink,
    accessibilityLabel: 'New player: create an account',
    phaseOffset: 0,
  },
  {
    mode: 'back' as const,
    label: 'RETURNING',
    stat: 'XP +',
    title: 'Sign in',
    subtitle: 'Welcome back!',
    tint: colors.holoGold,
    accessibilityLabel: 'Returning player: sign in',
    phaseOffset: 0.5,
  },
];

const MIN_PASSWORD_LENGTH = 8;

// Turn Supabase's error into something a person can act on
function friendlyError(error: AuthError) {
  switch (error.code) {
    case 'invalid_credentials':
      return 'That email or password is not right. Please try again.';
    case 'email_not_confirmed':
      return 'Please confirm your email first. Check your inbox for the link.';
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Choose the Sign in card instead.';
    case 'weak_password':
      return 'Please choose a stronger password.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many tries. Please wait a minute and try again.';
    default:
      return 'Something went wrong. Please check your connection and try again.';
  }
}

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const pick = (next: Mode) => {
    setMode(next);
    setMessage(null);
  };

  const submit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes('@')) {
      setMessage({ kind: 'error', text: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage({
        kind: 'error',
        text: `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
      return;
    }

    setBusy(true);
    setMessage(null);
    if (mode === 'new') {
      const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
      if (error) {
        setMessage({ kind: 'error', text: friendlyError(error) });
      } else if (!data.session) {
        // Supabase sends a confirmation email before the account can sign in
        setMessage({
          kind: 'info',
          text: 'Almost there! Check your email for a confirmation link, then come back and sign in.',
        });
        setMode('back');
        setPassword('');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
      if (error) {
        setMessage({ kind: 'error', text: friendlyError(error) });
      }
    }
    // On success the session changes and the app opens Home automatically
    setBusy(false);
  };

  const chosen = CARDS.find((card) => card.mode === mode);
  const other = CARDS.find((card) => card.mode !== mode);

  const renderCard = (
    card: (typeof CARDS)[number],
    look: { selected?: boolean; dimmed?: boolean; scale: number },
  ) => (
    <HoloCard
      key={card.mode}
      label={card.label}
      stat={card.stat}
      title={card.title}
      subtitle={card.subtitle}
      tint={card.tint}
      accessibilityLabel={card.accessibilityLabel}
      phaseOffset={card.phaseOffset}
      selected={look.selected}
      dimmed={look.dimmed}
      scale={look.scale}
      onPress={() => pick(card.mode)}
    />
  );

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          // While choosing a card the screen stays still, so finger moves tilt the card instead of scrolling
          scrollEnabled={!!mode}
          contentContainerStyle={[styles.content, !mode && styles.contentCentered]}
          keyboardShouldPersistTaps="handled">
          <LiloMoodArt mood="welcome" pixelSize={mode ? 3 : 4} bob />

          <View style={styles.titleBlock}>
            <Text style={styles.title} accessibilityRole="header">
              FoodieMentor
            </Text>
            <Text style={styles.tagline}>Track your meals the way you actually eat them</Text>
          </View>

          <View style={styles.cardsBlock}>
            {!mode && <Text style={styles.kicker}>CHOOSE YOUR CARD</Text>}
            {mode && chosen && other ? (
              <CardStack
                key={mode}
                backOnLeft={other.mode === 'new'}
                front={renderCard(chosen, { selected: true, scale: 0.8 })}
                back={renderCard(other, { dimmed: true, scale: 0.62 })}
              />
            ) : (
              <View style={styles.cardsRow}>
                {CARDS.map((card) => renderCard(card, { scale: 1 }))}
              </View>
            )}
            {!mode && <Text style={styles.hint}>Tilt a card with your finger, then tap it</Text>}
          </View>

          {message && !mode && (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.message, message.kind === 'error' && styles.messageError]}>
              {message.text}
            </Text>
          )}

          {mode && (
            <View style={styles.form}>
              <Text style={styles.formTitle}>
                {chosen?.mode === 'new' ? 'New player? Make your account.' : 'Welcome back, player!'}
              </Text>

              <View style={styles.field}>
                <Text style={styles.fieldLabel} nativeID="email-label">
                  Email
                </Text>
                <TextInput
                  accessibilityLabelledBy="email-label"
                  accessibilityLabel="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel} nativeID="password-label">
                  Password
                </Text>
                <View>
                  <TextInput
                    accessibilityLabelledBy="password-label"
                    accessibilityLabel="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    placeholderTextColor={colors.placeholder}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete={mode === 'new' ? 'new-password' : 'current-password'}
                    textContentType={mode === 'new' ? 'newPassword' : 'password'}
                    style={[styles.input, styles.passwordInput]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    onPress={() => setShowPassword((shown) => !shown)}
                    style={styles.showButton}>
                    <Text style={styles.showButtonText}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                </View>
              </View>

              {message && (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.message, message.kind === 'error' && styles.messageError]}>
                  {message.text}
                </Text>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={submit}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}>
                {busy ? (
                  <ActivityIndicator color={colors.cream} />
                ) : (
                  <Text style={styles.primaryText}>{mode === 'new' ? 'START' : 'CONTINUE'}</Text>
                )}
              </Pressable>

              {mode === 'back' && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setMessage({
                      kind: 'info',
                      text: 'Password reset is coming soon. For now, create a new account if you are stuck.',
                    })
                  }
                  style={styles.linkButton}>
                  <Text style={styles.linkText}>Forgot password?</Text>
                </Pressable>
              )}
            </View>
          )}

          <Text style={styles.legal}>
            By continuing you agree to our Terms and Privacy Policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 24,
  },
  contentCentered: {
    justifyContent: 'center',
  },
  titleBlock: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontFamily: fonts.pixel,
    fontSize: 18,
    color: colors.navy,
    textShadowColor: colors.cream,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  tagline: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.plum,
    textAlign: 'center',
  },
  cardsBlock: {
    alignItems: 'center',
    gap: 12,
  },
  kicker: {
    fontFamily: fonts.pixel,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.navy,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.plum,
  },
  form: {
    alignSelf: 'stretch',
    gap: 12,
  },
  formTitle: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 15,
    color: colors.navy,
    textAlign: 'center',
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 14,
    color: colors.navy,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.fieldLine,
    backgroundColor: colors.cream,
    color: colors.navy,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingHorizontal: 16,
  },
  passwordInput: {
    paddingRight: 72,
  },
  showButton: {
    position: 'absolute',
    right: 4,
    top: 4,
    height: 44,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showButtonText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 14,
    color: colors.berry,
  },
  message: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.navy,
    textAlign: 'center',
  },
  messageError: {
    color: colors.berry,
  },
  primaryButton: {
    height: 56,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.navy,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `4px 4px 0 ${colors.lycheePink}`,
  },
  primaryPressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    boxShadow: `2px 2px 0 ${colors.lycheePink}`,
  },
  primaryText: {
    fontFamily: fonts.pixel,
    fontSize: 12,
    color: colors.cream,
  },
  linkButton: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 14,
    color: colors.berry,
    textDecorationLine: 'underline',
  },
  legal: {
    marginTop: 'auto',
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.plum,
    textAlign: 'center',
  },
});
