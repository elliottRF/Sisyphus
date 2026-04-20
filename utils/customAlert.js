import { emit, AppEvents } from './events';

/**
 * Global alert utility that mimics React Native's Alert.alert
 * but triggers the CustomAlert component instead.
 * 
 * @param {string} title 
 * @param {string} description 
 * @param {Array} buttons 
 * @param {object} options 
 */
export const customAlert = (title, description, buttons = [], options = {}) => {
  // If no buttons, provide a default "OK" button to allow closing
  const finalButtons = (buttons && buttons.length > 0) 
    ? buttons 
    : [{ text: 'OK', style: 'default' }];

  // Auto-detect icon type based on title or button styles
  let iconType = options.iconType;
  if (!iconType) {
    const titleLower = title?.toLowerCase() || '';
    if (titleLower.includes('error') || titleLower.includes('fail') || titleLower.includes('delete') || titleLower.includes('remove')) {
      iconType = 'destructive';
    } else if (titleLower.includes('success') || titleLower.includes('confirm') || titleLower.includes('complete')) {
      iconType = 'confirm';
    } else {
      // Check if any button is destructive
      const hasDestructive = finalButtons.some(b => b.style === 'destructive');
      iconType = hasDestructive ? 'destructive' : 'default';
    }
  }

  emit(AppEvents.SHOW_CUSTOM_ALERT, {
    title,
    description,
    buttons: finalButtons,
    iconType
  });
};
