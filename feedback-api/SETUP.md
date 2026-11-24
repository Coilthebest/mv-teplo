# Подключение Postbox для mv-teplo.ru

Создано 24 ноября 2026 в рабочем каталоге `default` (`b1gga5qg2osfut1i6ero`):

- Адрес Postbox: `mail.mv-teplo.ru`, ID `egtk6out1o7nrm4ncuhs`.
- Ограничение отправителя: только `noreply@mail.mv-teplo.ru`.
- У существующего сервисного аккаунта сайта `teplo-storag` (`ajei34li0of4njq5o8uc`) добавлена с согласия владельца роль `postbox.sender`. Прежние роли сохранены.

DKIM пока не подтверждён. В текущей DNS-зоне `mv-teplo.ru` добавить ровно эти две записи (получены со страницы созданного адреса):

| Тип | Имя в зоне mv-teplo.ru | Значение | Режим |
| --- | --- | --- | --- |
| CNAME | egtk6out1o7nrm4ncuhs-1._domainkey.mail | egtk6out1o7nrm4ncuhs-1.dkim.pstbx.ru | DNS only |
| CNAME | egtk6out1o7nrm4ncuhs-2._domainkey.mail | egtk6out1o7nrm4ncuhs-2.dkim.pstbx.ru | DNS only |

TTL — Auto. Страница адреса: https://console.yandex.cloud/folders/b1gga5qg2osfut1i6ero/postbox/identity/egtk6out1o7nrm4ncuhs/overview .

После DNS: дождаться Success, проверить, что рабочая функция использует этот сервисный аккаунт, применить `install.cjs` к актуальной серверной версии, добавить `FEEDBACK_EMAIL_FROM=Teplo <noreply@mail.mv-teplo.ru>`, опубликовать серверную и клиентскую части и проверить реальным письмом. На момент сохранения новой версии интерфейса рабочий сайт не менялся, настоящий тест письма не выполнялся. Код и инструкции сохранены в ветке `feedback-email-verification` / PR №16.
