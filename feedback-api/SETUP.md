# Подключение Postbox для mv-teplo.ru

Создано 24 ноября 2026 в рабочем каталоге `default` (`b1gga5qg2osfut1i6ero`):

- Адрес Postbox: `mail.mv-teplo.ru`, ID `egtk6out1o7nrm4ncuhs`.
- Ограничение отправителя: только `noreply@mail.mv-teplo.ru`.
- У существующего сервисного аккаунта сайта `teplo-storag` (`ajei34li0of4njq5o8uc`) добавлена с согласия владельца роль `postbox.sender`. Прежние роли сохранены.

DKIM подтверждён 24 ноября 2026, статус Postbox — Success. Владелец добавил в текущей DNS-зоне `mv-teplo.ru` обе записи, полученные со страницы созданного адреса:

| Тип | Имя в зоне mv-teplo.ru | Значение | Режим |
| --- | --- | --- | --- |
| CNAME | egtk6out1o7nrm4ncuhs-1._domainkey.mail | egtk6out1o7nrm4ncuhs-1.dkim.pstbx.ru | DNS only |
| CNAME | egtk6out1o7nrm4ncuhs-2._domainkey.mail | egtk6out1o7nrm4ncuhs-2.dkim.pstbx.ru | DNS only |

TTL — Auto. Страница адреса: https://console.yandex.cloud/folders/b1gga5qg2osfut1i6ero/postbox/identity/egtk6out1o7nrm4ncuhs/overview .

Рабочая функция использует этот сервисный аккаунт. Из её редактора сохранены текущие `index.js` и `feedback.js`, на их основе применён `install.cjs`; текущий маршрут `payment-prints` сохранён. Добавлена `FEEDBACK_EMAIL_FROM=Teplo <noreply@mail.mv-teplo.ru>`. Обновление касается только отзывов, маршрутов отзывов и передачи IAM-токена.

Хранилище использует существующую роль storage.uploader: публикации скрываются через флаг hidden, без удаления объектов. Код не требует rename/unlink на смонтированном бакете. Повторные завершённые запросы распознаются по сохранённым данным; параллельные запросы внутри одного экземпляра блокируются, транзакционной блокировки между разными экземплярами нет.

Код и инструкции сохранены в ветке `feedback-email-verification` / PR №16. Следующий шаг — завершить публикацию и проверить цепочку реальным письмом.
