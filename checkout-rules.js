(function (root) {
  'use strict';
  const text = (value, max) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
  function fullManualAddress(address, city) {
    address = text(address, 500); city = text(city, 120);
    return address && city && !address.toLocaleLowerCase('ru-RU').includes(city.toLocaleLowerCase('ru-RU')) ? text(`${city}, ${address}`, 500) : address;
  }
  function phone(value) {
    const raw = text(value, 50), digits = raw.replace(/\D/g, '');
    if (/[^\d+()\s.-]/u.test(raw) || (raw.match(/\+/g) || []).length > 1 || (raw.includes('+') && !raw.startsWith('+'))) return '';
    if (digits.length === 10 && !raw.startsWith('+')) return '+7' + digits;
    if (digits.length === 11 && /^[78]/.test(digits)) return '+7' + digits.slice(1);
    return raw.startsWith('+') && /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : '';
  }
  function point(value) {
    if (!value || typeof value !== 'object') return null;
    const id = text(value.id, 200), city = text(value.city, 120), address = text(value.address, 500);
    if (!id || city.length < 2 || address.length < 5) return null;
    return { id, city, address, source: 'yandex-widget' };
  }
  // The map returns the selected address and ID, but displays its ETA separately.
  function widgetDate(value) {
    const label = text(value, 80);
    const month = '(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)';
    const day = '(?:[1-9]|[12]\\d|3[01])';
    const calendar = `${day}(?:\\s*[-–—]\\s*${day})?\\s+${month}(?:\\s+20\\d{2})?`;
    const date = `(?:сегодня|завтра|послезавтра|${calendar})`;
    return new RegExp(`^(?:(?:с|до)\\s+)?${date}(?:\\s*(?:[-–—]|по)\\s*${date})?$`, 'iu').test(label) ? label : '';
  }
  function validate(input, physical = true, allowDoor = false) {
    const data = {
      name: text(input.name, 80), phone: phone(input.phone), city: text(input.city, 120),
      pickup: point(input.pickup), deliveryMethod: physical ? 'pickup' : 'digital', doorAddress: '',
    };
    const errors = {};
    if (data.name.length < 2 || !/\p{L}/u.test(data.name)) errors.name = 'Укажите ваше имя.';
    if (!data.phone) errors.phone = 'Укажите телефон с кодом страны, например +7 999 123-45-67.';
    if (physical && input.deliveryMethod === 'door') {
      data.deliveryMethod = 'door';
      data.pickup = null;
      data.city = '';
      data.doorAddress = text(input.doorAddress, 500);
      if (!allowDoor || data.doorAddress.length < 5) errors.pickup = 'Укажите полный адрес доставки до двери.';
    } else if (physical) {
      data.city = data.pickup?.city || '';
      if (!data.pickup) errors.pickup = 'Выберите пункт выдачи на карте.';
    } else { data.city = ''; data.pickup = null; }
    return { ok: !Object.keys(errors).length, errors, data };
  }
  const api = Object.freeze({ text, phone, point, widgetDate, fullManualAddress, validate });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TeploCheckoutRules = api;
})(typeof window === 'undefined' ? globalThis : window);
