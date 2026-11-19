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
  function validate(input, physical = true) {
    const data = {
      name: text(input.name, 80), phone: phone(input.phone), city: text(input.city, 120),
      pickup: point(input.pickup), manualAddress: text(input.manualAddress, 500),
    };
    const errors = {};
    if (data.name.length < 2 || !/\p{L}/u.test(data.name)) errors.name = 'Укажите ваше имя.';
    if (!data.phone) errors.phone = 'Укажите телефон с кодом страны, например +7 999 123-45-67.';
    if (physical) {
      data.city = data.pickup?.city || '';
      if (!data.pickup && data.manualAddress.length < 5) errors.pickup = 'Выберите пункт на карте или укажите адрес ПВЗ вручную.';
    } else { data.city = ''; data.pickup = null; data.manualAddress = ''; }
    return { ok: !Object.keys(errors).length, errors, data };
  }
  const api = Object.freeze({ text, phone, point, fullManualAddress, validate });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TeploCheckoutRules = api;
})(typeof window === 'undefined' ? globalThis : window);
