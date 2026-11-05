// Marquee landing: the page in the visitor's language. lang.js has already chosen it and set
// <html lang>; English lives in the HTML, so only the other languages are here. Elements carry
// data-i18n="key" (their inner HTML) or data-i18n-attr="attribute:key". The recorder drawn in
// the hero stays in English, like a screenshot of the app.
(() => {
	const T = {
		ru: {
			"meta.title": "Marquee: бесплатная запись экрана с открытым кодом",
			skip: "Перейти к содержимому",
			"nav.label": "Основное меню",
			"brand.home": "Marquee, на главную",
			"nav.how": "Как это работает",
			"nav.studio": "Studio",
			"nav.faq": "Вопросы",
			"hero.badge": "Сейчас в прокате · Бесплатно и с открытым кодом",
			"hero.draw": "Выделите ",
			"hero.box": "область",
			"hero.drawEnd": ".",
			"hero.rec": "Нажмите запись",
			"hero.send": "Отправьте клип.",
			"hero.sub":
				"Marquee записывает любую часть экрана и сохраняет MP4, как только вы остановите запись. Если клипу нужна доводка, Studio добавит зум, рамку устройства и субтитры.",
			"cta.download": "Скачать на GitHub",
			"hero.source": "Исходный код",
			"proof.os": "Windows, macOS и Linux",
			"proof.mit": "Лицензия MIT",
			"proof.account": "Без аккаунта",
			"stage.label":
				"Marquee в работе: на экране выделяют область, несколько секунд записывают её и сохраняют клип, который можно скопировать файлом или ссылкой.",
			"why.label": "Зачем Marquee",
			"why.p1":
				"<b>Показать проще, чем объяснить.</b> Десять секунд видео с багом, графиком или новой кнопкой скажут больше, чем три абзаца в чате.",
			"why.p2":
				"<b>С Marquee такой клип всегда под рукой.</b> Программа ждёт в трее, запускается одним сочетанием клавиш и кладёт каждую запись в выбранную вами папку, уже с названием и готовой к отправке.",
			"how.title": "Три акта. Без антракта.",
			"act1.no": "Акт I",
			"act1.title": "Нажмите сочетание клавиш",
			"act1.text":
				"Одно сочетание клавиш запускает и останавливает запись откуда угодно. Выбор области открывается с прошлой рамкой, так что для повторного дубля хватит сочетания клавиш и Enter.",
			"act2.no": "Акт II",
			"act2.title": "Выделите область",
			"act2.text":
				"Выделите любую область, подгоните её под 16:9, 4:3, 1:1 или 9:16 или выберите точный кадр 720p или 1080p. Размер показан в настоящих пикселях.",
			"act3.no": "Акт III",
			"act3.title": "Остановите и отправьте",
			"act3.text":
				"Через секунду или две MP4 уже в папке. Скопируйте файл прямо в чат или загрузите его на Яндекс Диск и скопируйте ссылку.",
			"ticker.label": "Что Marquee записывает и экспортирует",
			ticker: [
				"Область",
				"Окно",
				"Экран",
				"720p",
				"1080p",
				"Исходный размер",
				"30 или 60 fps",
				"Системный звук",
				"Микрофон",
				"Камера",
				"Автозум",
				"Эффекты курсора",
				"Размытие движения",
				"Субтитры",
				"Рамки устройств",
				"MP4",
				"GIF",
				"13 языков",
			],
			"studio.title": "Нужна доводка?<br>Откройте Studio.",
			"studio.sub":
				"Включите камеру или редактируемый курсор, и запись сохранит дорожки для Studio. Оформите, обрежьте и экспортируйте её в одном окне.",
			"frames.title": "Рамки устройств в настоящих пропорциях",
			"frames.text":
				"Телефон, планшет, ноутбук или окно браузера в графитовом, серебристом, чёрном или белом цвете. Устройство никогда не растягивается под видео: вы масштабируете его, поворачиваете и выбираете, заполнить кадр или вписать.",
			"frames.alt":
				"Studio с открытой вкладкой Frame: запись Marquee внутри графитового ноутбука на коралловом градиенте, справа настройки устройства и цвета, внизу клип на таймлайне.",
			"cut.title": "Режьте, как в видеоредакторе",
			"cut.text":
				"Разрезайте клавишей <kbd>T</kbd> и удаляйте клавишей <kbd>Delete</kbd>, как в любом редакторе. Место разреза остаётся отмеченным на дорожке, а один клик возвращает кусок обратно.",
			"cut.alt":
				"Таймлайн: из середины клипа вырезан кусок, половины сомкнулись, а на месте разреза стоит значок ножниц.",
			cap1: "<span>00:00:04,120</span>Итак, это новое меню экспорта.",
			cap2: "<span>00:00:07,480</span>Сначала выберите формат, потом место.",
			cap3: '<span>00:00:11,050</span>И ссылка уже скопирована<i class="caret"></i>',
			"captions.title": "Субтитры прямо на вашем компьютере",
			"captions.text":
				"Whisper превращает 77 секунд встречи в текст примерно за 14 секунд на видеокарте среднего уровня. Расшифровка и субтитры появляются рядом с видео. Ничего не загружается в сеть.",
			"zoom.title": "Зум, который следует за курсором",
			"zoom.text":
				"Автозум следит за тем, где вы работаете. Глубину, длительность, плавность и положение можно настроить с точностью до пикселя.",
			"export.title": "Один экспорт, любая площадка",
			"export.text":
				"MP4 в 720p, 1080p или исходном размере, либо GIF. Сохраните куда угодно или опубликуйте на Яндекс Диске и скопируйте ссылку.",
			"tagline.eyebrow": "Мелкий шрифт, крупными буквами",
			"tagline.text":
				"Каждый клип ложится в <em>вашу</em> папку. Ничего не уходит с компьютера, пока вы <em>не попросите,</em> и ничего не закрыто <em>платной подпиской.</em>",
			"free.eyebrow": "Бесплатно, честно",
			"free.title": "Не пробная версия. Не тариф.",
			"free.sub":
				"У Marquee нет платного тарифа, водяного знака и входа в аккаунт. Лицензия MIT позволяет пользоваться им на работе, менять код и выпускать свою сборку.",
			fact1: "аккаунтов нужно создать до первой записи",
			fact2: "водяных знаков, навязанных покупок и закрытых функций",
			fact3: "лицензия для личного и коммерческого использования",
			credits:
				'Marquee вырос из <a class="link" href="https://github.com/siddharthvaddem/openscreen">OpenScreen</a>. Его создал Siddharth Vaddem, а продолжают участники проекта.',
			"faq.eyebrow": "Частые вопросы",
			"faq.title": "Вопросы из первого ряда",
			"faq1.q": "Marquee правда бесплатный?",
			"faq1.a":
				"Да. Платного тарифа нет, и ничего не заблокировано. Лицензия MIT разрешает личное и коммерческое использование, изменения и распространение.",
			"faq2.q": "На каких системах он работает?",
			"faq2.a":
				'Windows, macOS (Apple Silicon и Intel) и Linux: пакет .deb, пакет .pacman или AppImage. Все установщики лежат на <a class="link" href="https://github.com/Likemiens/openscreen/releases/latest">странице релизов</a>.',
			"faq3.q": "Почему компьютер предупреждает при первом запуске?",
			"faq3.a":
				'Установщики пока не подписаны. В Windows нажмите «Подробнее», затем «Выполнить в любом случае». Для macOS в <a class="link" href="https://github.com/Likemiens/openscreen#macos">инструкции по установке</a> есть команда в одну строку, которая снимает флаг карантина.',
			"faq4.q": "Почему установщик называется OpenScreen?",
			"faq4.a":
				"Раньше Marquee назывался OpenScreen Creator Edition. Релизы на GitHub пока выходят под старым названием.",
			"faq5.q": "Он загружает мои записи в сеть?",
			"faq5.a":
				"Нет. Каждый клип сохраняется в вашу папку. Ссылка появляется, только когда вы нажимаете Copy link: тогда этот один файл загружается на ваш Яндекс Диск. Отправка никогда не удаляет клип из папки.",
			"faq6.q": "Можно записать камеру и голос?",
			"faq6.a":
				"Да. Микрофон и системный звук включаются переключателями на панели записи, а к записи окна или экрана можно добавить камеру в режиме «картинка в картинке». Клипы области всегда включают курсор и обходятся без камеры.",
			"faq7.q": "Как субтитры работают без облака?",
			"faq7.a":
				"Whisper работает на вашем компьютере. Речевая модель скачивается один раз, при первой расшифровке (около 560 МБ для модели под видеокарту и 250 МБ для модели под процессор), а дальше всё работает без интернета.",
			"faq8.q": "Можно редактировать видео, записанное не в Marquee?",
			"faq8.a":
				"Да. Studio открывает файлы MP4, MOV, WebM, MKV и AVI: через заголовок окна, перетаскиванием файла в редактор или из меню панели записи.",
			"faq9.q": "Он стабильный?",
			"faq9.a":
				'Это молодая программа, так что шероховатости возможны. Если вы нашли ошибку, больше всего поможет <a class="link" href="https://github.com/Likemiens/openscreen/issues">issue на GitHub</a>.',
			"finale.title": "Сейчас в прокате на GitHub",
			"finale.sub": "Бесплатно для Windows, macOS и Linux.",
			"finale.star": "или поставьте звезду репозиторию",
			"footer.tagline":
				"Бесплатная программа для записи экрана с открытым кодом: для быстрых клипов и аккуратных демо.",
			"footer.author": "Создано с желанием решить боль <b>Александром Варанцовым</b>.",
			"footer.label": "Нижнее меню",
			"footer.product": "Продукт",
			"f.download": "Скачать",
			"f.releases": "Все релизы",
			"footer.project": "Проект",
			"f.source": "Исходный код",
			"f.issues": "Ошибки и идеи",
			"f.contributing": "Как помочь проекту",
			"f.brand": "Материалы бренда",
			"footer.legal": "Документы",
			"f.privacy": "Конфиденциальность",
			"f.original": "Оригинальный OpenScreen",
			"footer.copy": "© 2026 Likemiens. Распространяется по лицензии MIT.",
			"footer.privacy": "Эта страница не ставит cookie и не собирает аналитику.",
			"lang.label": "Язык",
			"404.title": "Страница не найдена · Marquee",
			"404.eyebrow": "Ошибка 404",
			"404.h": "Эту сцену вырезали.",
			"404.sub": "Этой страницы нет в программе. До главной сцены один клик.",
			"404.cta": "Вернуться на главную сцену",
			"brand.page": "Материалы бренда · Marquee",
			"brand.navHome": "Главная",
			"brand.nav": "Бренд",
			"brand.h": "Рамка из лампочек вокруг огонька записи",
			"brand.intro":
				"Вблизи знак похож на театральную вывеску с лампочками. В размере иконки он превращается в пунктирную рамку выделения, ту самую, что рисует приложение, когда вы выбираете область. Красная точка повторяет кнопку записи самого приложения.",
			"brand.mark.h": "Знак",
			"brand.mark.p":
				"Для тёмного фона. Оставляйте вокруг свободное поле шириной в один ряд лампочек.",
			"brand.mark.alt":
				"Знак Marquee: восемнадцать тёплых лампочек в скруглённой рамке вокруг красной точки.",
			"brand.icon.h": "Иконка приложения",
			"brand.icon.p":
				"Графитовый сквиркл, лампочки с мягким свечением. Где SVG не принимают, берите PNG.",
			"brand.icon.alt": "Иконка приложения Marquee: знак на графитовом скруглённом квадрате.",
			"brand.lockup.h": "Логотип",
			"brand.lockup.p":
				"Знак и название, набранное Geist Semibold и переведённое в кривые, так что шрифт не нужен.",
			"brand.lockup.alt": "Логотип Marquee: знак рядом со словом Marquee.",
			"brand.sign.h": "Вывеска",
			"brand.sign.p":
				"Название из лампочек, пять на семь, с огоньком записи в хвостике Q. Для больших моментов: финал, обложка, карточка для соцсетей.",
			"brand.colors": "Цвета",
			"sw.graphite": "Графит",
			"sw.bulb": "Лампочка",
			"sw.record": "Запись",
			"sw.action": "Действие",
			"sw.saved": "Сохранено",
			"brand.type": "Шрифты: Geist и Geist Mono, лицензия SIL Open Font License.",
		},

		es: {
			"meta.title": "Marquee: grabador de pantalla gratuito y de código abierto",
			skip: "Saltar al contenido",
			"nav.label": "Principal",
			"brand.home": "Marquee, inicio",
			"nav.how": "Cómo funciona",
			"nav.studio": "Studio",
			"nav.faq": "Preguntas",
			"hero.badge": "En cartelera · Gratis y de código abierto",
			"hero.draw": "Dibuja un ",
			"hero.box": "recuadro",
			"hero.drawEnd": ".",
			"hero.rec": "Presiona grabar",
			"hero.send": "Envía el clip.",
			"hero.sub":
				"Marquee graba cualquier parte de tu pantalla y guarda el MP4 en cuanto detienes la grabación. Cuando un clip necesita pulirse, Studio añade zooms, marcos de dispositivo y subtítulos.",
			"cta.download": "Descargar en GitHub",
			"hero.source": "Ver el código",
			"proof.os": "Windows, macOS y Linux",
			"proof.mit": "Licencia MIT",
			"proof.account": "Sin cuenta",
			"stage.label":
				"Marquee en acción: se selecciona un área de la pantalla, se graba unos segundos y se guarda como clip, listo para copiar como archivo o enlace.",
			"why.label": "Por qué Marquee",
			"why.p1":
				"<b>Mostrar es mejor que explicar.</b> Un clip de diez segundos del fallo, la gráfica o el botón nuevo dice más que tres párrafos en un chat.",
			"why.p2":
				"<b>Con Marquee, ese clip está a un atajo de distancia.</b> Espera en la bandeja del sistema, empieza con un solo atajo y guarda cada grabación en la carpeta que elijas, ya con nombre y lista para enviar.",
			"how.title": "Tres actos. Sin intermedio.",
			"act1.no": "Acto I",
			"act1.title": "Presiona el atajo",
			"act1.text":
				"Un solo atajo inicia y detiene la grabación desde cualquier lugar. El selector de área se abre con tu última área ya dibujada, así que repetir la toma es presionar el atajo y luego Enter.",
			"act2.no": "Acto II",
			"act2.title": "Dibuja el área",
			"act2.text":
				"Arrastra cualquier área, ajústala a 16:9, 4:3, 1:1 o 9:16, o elige un cuadro exacto de 720p o 1080p. El tamaño se muestra en píxeles reales.",
			"act3.no": "Acto III",
			"act3.title": "Detén y envía",
			"act3.text":
				"Uno o dos segundos después, el MP4 ya está en tu carpeta. Copia el archivo directamente en un chat, o súbelo a Yandex Disk y copia el enlace.",
			"ticker.label": "Qué graba y exporta Marquee",
			ticker: [
				"Área",
				"Ventana",
				"Pantalla",
				"720p",
				"1080p",
				"Tamaño original",
				"30 o 60 fps",
				"Audio del sistema",
				"Micrófono",
				"Cámara",
				"Zoom automático",
				"Efectos del cursor",
				"Desenfoque de movimiento",
				"Subtítulos",
				"Marcos de dispositivo",
				"MP4",
				"GIF",
				"13 idiomas",
			],
			"studio.title": "Si necesita pulirse,<br>abre Studio.",
			"studio.sub":
				"Activa la cámara o haz editable el cursor, y la grabación conserva sus pistas para Studio. Enmárcala, recórtala y expórtala desde una sola ventana.",
			"frames.title": "Marcos de dispositivo con proporciones reales",
			"frames.text":
				"Teléfono, tableta, laptop o ventana del navegador, en grafito, plata, negro o blanco. El dispositivo nunca se estira para encajar el video: tú lo escalas, lo giras y eliges rellenar o ajustar.",
			"frames.alt":
				"Studio con la pestaña Frame abierta: una grabación de Marquee dentro de una laptop grafito sobre un degradado coral, con los ajustes de dispositivo y color a la derecha y el clip en la línea de tiempo debajo.",
			"cut.title": "Corta como en un editor",
			"cut.text":
				"Divide con <kbd>T</kbd> y elimina con <kbd>Delete</kbd>, como en cualquier editor. El corte queda marcado en la pista y un clic devuelve el fragmento.",
			"cut.alt":
				"La línea de tiempo: el clip con un fragmento recortado del medio, las dos mitades unidas y unas tijeras donde estaba el corte.",
			cap1: "<span>00:00:04,120</span>Este es el nuevo menú de exportación.",
			cap2: "<span>00:00:07,480</span>Primero elige el formato y luego el destino.",
			cap3: '<span>00:00:11,050</span>Y el enlace ya está copiado<i class="caret"></i>',
			"captions.title": "Subtítulos hechos en tu computadora",
			"captions.text":
				"Whisper convierte una reunión de 77 segundos en texto en unos 14 segundos con una GPU de gama media. La transcripción y los subtítulos aparecen junto al video. No se sube nada.",
			"zoom.title": "Zooms que siguen al cursor",
			"zoom.text":
				"El zoom automático sigue dónde trabajas. Profundidad, duración, suavizado y posición se ajustan a tu gusto, al píxel.",
			"export.title": "Exporta una vez, comparte donde quieras",
			"export.text":
				"MP4 a 720p, 1080p o tamaño original, o un GIF. Guárdalo donde quieras, o publícalo en Yandex Disk y copia el enlace.",
			"tagline.eyebrow": "La letra pequeña, en letra grande",
			"tagline.text":
				"Cada clip va a una carpeta <em>tuya.</em> Nada sale de tu computadora a menos que lo <em>pidas,</em> y nada queda bloqueado tras un <em>pago.</em>",
			"free.eyebrow": "Gratis de verdad",
			"free.title": "Ni prueba. Ni planes.",
			"free.sub":
				"Marquee no tiene plan de pago, ni marca de agua, ni inicio de sesión. Tiene licencia MIT, así que puedes usarlo en el trabajo, modificarlo y publicar tu propia versión.",
			fact1: "cuentas que crear antes de tu primera grabación",
			fact2: "marcas de agua, ventas adicionales o funciones bloqueadas",
			fact3: "licencia, para uso personal y comercial",
			credits:
				'Marquee es un fork de <a class="link" href="https://github.com/siddharthvaddem/openscreen">OpenScreen</a>, creado por Siddharth Vaddem y continuado por sus colaboradores.',
			"faq.eyebrow": "Preguntas frecuentes",
			"faq.title": "Preguntas desde la primera fila",
			"faq1.q": "¿Marquee es gratis de verdad?",
			"faq1.a":
				"Sí. No hay plan de pago y nada está bloqueado. La licencia MIT permite el uso personal y comercial, los cambios y la redistribución.",
			"faq2.q": "¿En qué sistemas funciona?",
			"faq2.a":
				'Windows, macOS (Apple Silicon e Intel) y Linux, como .deb, paquete .pacman o AppImage. Todos los instaladores están en la <a class="link" href="https://github.com/Likemiens/openscreen/releases/latest">página de versiones</a>.',
			"faq3.q": "¿Por qué mi computadora muestra una advertencia la primera vez?",
			"faq3.a":
				'Los instaladores aún no están firmados. En Windows, elige Más información y luego Ejecutar de todas formas. En macOS, las <a class="link" href="https://github.com/Likemiens/openscreen#macos">notas de instalación</a> tienen un comando de una línea que quita la marca de cuarentena.',
			"faq4.q": "¿Por qué el instalador dice OpenScreen?",
			"faq4.a":
				"Marquee es el nuevo nombre de OpenScreen Creator Edition. Por ahora, las versiones en GitHub siguen llevando el nombre anterior.",
			"faq5.q": "¿Sube mis grabaciones?",
			"faq5.a":
				"No. Cada clip se guarda en tu propia carpeta. Solo se crea un enlace cuando presionas Copy link, que sube ese único archivo a tu Yandex Disk. Compartir nunca borra el clip de tu carpeta.",
			"faq6.q": "¿Puede grabar mi cámara y mi voz?",
			"faq6.a":
				"Sí. El micrófono y el audio del sistema se activan en el grabador, y las grabaciones de ventana o pantalla pueden incluir la cámara como imagen en imagen. Los clips de área siempre incluyen el cursor y dejan fuera la cámara.",
			"faq7.q": "¿Cómo funcionan los subtítulos sin la nube?",
			"faq7.a":
				"Whisper funciona en tu computadora. El modelo de voz se descarga una sola vez, la primera vez que transcribes (unos 560 MB el modelo para GPU y 250 MB el del procesador), y después funciona sin conexión.",
			"faq8.q": "¿Puedo editar un video que no grabé con Marquee?",
			"faq8.a":
				"Sí. Studio abre archivos MP4, MOV, WebM, MKV y AVI desde la barra de título, arrastrando un archivo al editor o desde el menú del grabador.",
			"faq9.q": "¿Es estable?",
			"faq9.a":
				'Es software joven, así que habrá detalles por pulir. Si algo falla, lo que más ayuda es abrir un <a class="link" href="https://github.com/Likemiens/openscreen/issues">issue en GitHub</a>.',
			"finale.title": "En cartelera en GitHub",
			"finale.sub": "Gratis para Windows, macOS y Linux.",
			"finale.star": "o dale una estrella al repositorio",
			"footer.tagline":
				"Un grabador de pantalla gratuito y de código abierto para clips rápidos y demos pulidas.",
			"footer.author":
				"Hecho por <b>Alexandr Varantsov</b>, con el deseo de resolver un problema real.",
			"footer.label": "Pie de página",
			"footer.product": "Producto",
			"f.download": "Descargar",
			"f.releases": "Todas las versiones",
			"footer.project": "Proyecto",
			"f.source": "Código fuente",
			"f.issues": "Incidencias",
			"f.contributing": "Cómo contribuir",
			"f.brand": "Recursos de marca",
			"footer.legal": "Legal",
			"f.privacy": "Privacidad",
			"f.original": "OpenScreen original",
			"footer.copy": "© 2026 Likemiens. Publicado bajo la licencia MIT.",
			"footer.privacy": "Esta página no usa cookies ni analítica.",
			"lang.label": "Idioma",
			"404.title": "Página no encontrada · Marquee",
			"404.eyebrow": "Error 404",
			"404.h": "Esta escena se cortó.",
			"404.sub":
				"La página que buscas no está en el programa. El escenario principal está a un clic.",
			"404.cta": "Volver al escenario principal",
			"brand.page": "Recursos de marca · Marquee",
			"brand.navHome": "Inicio",
			"brand.nav": "Marca",
			"brand.h": "Un marco de bombillas alrededor de la luz de grabación",
			"brand.intro":
				"De cerca, el símbolo es una marquesina de teatro. A tamaño de icono se convierte en el marco punteado de una selección, justo lo que dibuja la app al elegir un área. El punto rojo es el botón de grabar del propio grabador.",
			"brand.mark.h": "Símbolo",
			"brand.mark.p":
				"Para fondos oscuros. Deja alrededor un margen libre de una fila de bombillas.",
			"brand.mark.alt":
				"El símbolo de Marquee: dieciocho bombillas cálidas en un marco redondeado alrededor de un punto rojo.",
			"brand.icon.h": "Icono de la app",
			"brand.icon.p":
				"Squircle grafito, con las bombillas y un brillo suave. Usa el PNG donde no se acepte SVG.",
			"brand.icon.alt":
				"El icono de la app Marquee: el símbolo sobre un cuadrado redondeado grafito.",
			"brand.lockup.h": "Logotipo",
			"brand.lockup.p":
				"El símbolo con el nombre en Geist Semibold, convertido a trazos, así que no necesita la fuente.",
			"brand.lockup.alt": "El logotipo de Marquee: el símbolo junto a la palabra Marquee.",
			"brand.sign.h": "El letrero",
			"brand.sign.p":
				"El nombre en bombillas, de cinco por siete, con la luz de grabación en la cola de la Q. Es para los grandes momentos: un final, una portada, una tarjeta para redes.",
			"brand.colors": "Colores",
			"sw.graphite": "Grafito",
			"sw.bulb": "Bombilla",
			"sw.record": "Grabar",
			"sw.action": "Acción",
			"sw.saved": "Guardado",
			"brand.type": "Tipografía: Geist y Geist Mono, SIL Open Font License.",
		},

		zh: {
			"meta.title": "Marquee：免费开源的录屏工具",
			skip: "跳到正文",
			"nav.label": "主导航",
			"brand.home": "Marquee 首页",
			"nav.how": "使用方式",
			"nav.studio": "Studio",
			"nav.faq": "常见问题",
			"hero.badge": "正在上映 · 免费且开源",
			"hero.draw": "画个",
			"hero.box": "框",
			"hero.drawEnd": "。",
			"hero.rec": "按下录制",
			"hero.send": "发送片段。",
			"hero.sub":
				"Marquee 能录制屏幕上的任意区域，停止的那一刻就存好 MP4。片段需要精修时，Studio 可以加上缩放、设备外框和字幕。",
			"cta.download": "在 GitHub 下载",
			"hero.source": "查看源代码",
			"proof.os": "Windows、macOS 和 Linux",
			"proof.mit": "MIT 许可证",
			"proof.account": "无需账号",
			"stage.label":
				"Marquee 演示：框选屏幕上的一块区域，录制几秒，保存为片段，可以复制文件或链接。",
			"why.label": "为什么选 Marquee",
			"why.p1":
				"<b>演示胜过解释。</b>录下 bug、图表或新按钮的十秒片段，比聊天里的三段文字更能说明问题。",
			"why.p2":
				"<b>有了 Marquee，这样的片段只差一个快捷键。</b>它常驻托盘，一个快捷键就能开始，每段录像都会存进你选定的文件夹，自动命名，随时可以发送。",
			"how.title": "三幕剧，没有中场休息。",
			"act1.no": "第一幕",
			"act1.title": "按下快捷键",
			"act1.text":
				"一个快捷键，随处开始或停止录制。区域选择器打开时会保留上次画好的区域，想重录一遍，按快捷键再按 Enter 就行。",
			"act2.no": "第二幕",
			"act2.title": "框选区域",
			"act2.text":
				"随意拖出一块区域，可以吸附到 16:9、4:3、1:1 或 9:16，也可以选择精确的 720p 或 1080p 画面。尺寸按实际像素显示。",
			"act3.no": "第三幕",
			"act3.title": "停止并发送",
			"act3.text":
				"一两秒后，MP4 就在你的文件夹里了。可以直接把文件复制进聊天，也可以上传到 Yandex Disk 再复制链接。",
			"ticker.label": "Marquee 能录制和导出的内容",
			ticker: [
				"区域",
				"窗口",
				"全屏",
				"720p",
				"1080p",
				"原始尺寸",
				"30 或 60 fps",
				"系统声音",
				"麦克风",
				"摄像头",
				"自动缩放",
				"光标效果",
				"运动模糊",
				"字幕",
				"设备外框",
				"MP4",
				"GIF",
				"13 种语言",
			],
			"studio.title": "需要精修时，<br>打开 Studio。",
			"studio.sub":
				"打开摄像头或启用可编辑光标，录像就会为 Studio 保留各条轨道。加框、剪辑和导出都在一个窗口里完成。",
			"frames.title": "按真实比例的设备外框",
			"frames.text":
				"手机、平板、笔记本或浏览器窗口，提供石墨色、银色、黑色和白色。设备绝不会为了适配视频而被拉伸：你可以缩放、旋转，并选择填充或适应。",
			"frames.alt":
				"打开 Frame 标签页的 Studio：一段 Marquee 录像放在石墨色笔记本电脑里，背景是珊瑚色渐变，右侧是设备和颜色设置，下方时间轴上是这段片段。",
			"cut.title": "像剪辑软件一样剪",
			"cut.text":
				"按 <kbd>T</kbd> 分割，按 <kbd>Delete</kbd> 删除，和任何剪辑软件一样。剪掉的位置会在轨道上留下标记，点一下就能把那段放回来。",
			"cut.alt": "时间轴：片段中间被剪掉一段，前后两半接在一起，剪切处有一个剪刀标记。",
			cap1: "<span>00:00:04,120</span>这就是新的导出菜单。",
			cap2: "<span>00:00:07,480</span>先选格式，再选保存位置。",
			cap3: '<span>00:00:11,050</span>链接已经复制好了<i class="caret"></i>',
			"captions.title": "字幕在你的电脑上生成",
			"captions.text":
				"在中端显卡上，Whisper 大约 14 秒就能把 77 秒的会议转成文字。文字稿和字幕会出现在视频旁边。不上传任何内容。",
			"zoom.title": "跟随光标的缩放",
			"zoom.text": "自动缩放会追踪你操作的位置。缩放深度、时长、缓动和位置都能自己调，精确到像素。",
			"export.title": "一次导出，随处分享",
			"export.text":
				"导出 720p、1080p 或原始尺寸的 MP4，也可以导出 GIF。保存到任意位置，或发布到 Yandex Disk 并复制链接。",
			"tagline.eyebrow": "小字条款，大字写明",
			"tagline.text":
				"每段片段都存进<em>你自己的</em>文件夹。除非<em>你要求，</em>任何内容都不会离开你的电脑，也没有任何功能被锁在<em>付费墙</em>后面。",
			"free.eyebrow": "真正免费",
			"free.title": "不是试用版，也没有付费档位。",
			"free.sub":
				"Marquee 没有付费方案、没有水印，也不用登录。它采用 MIT 许可证，你可以在工作中使用、修改它，并发布自己的版本。",
			fact1: "首次录制前需要注册的账号",
			fact2: "水印、推销或锁定的功能",
			fact3: "许可证，个人和商业用途皆可",
			credits:
				'Marquee 是 <a class="link" href="https://github.com/siddharthvaddem/openscreen">OpenScreen</a> 的分支。OpenScreen 由 Siddharth Vaddem 创建，并由贡献者们延续至今。',
			"faq.eyebrow": "常见问题",
			"faq.title": "来自前排的提问",
			"faq1.q": "Marquee 真的免费吗？",
			"faq1.a":
				"是的。没有付费方案，也没有锁定的功能。MIT 许可证允许个人和商业使用、修改和再分发。",
			"faq2.q": "支持哪些系统？",
			"faq2.a":
				'Windows、macOS（Apple Silicon 和 Intel）以及 Linux（.deb、.pacman 软件包或 AppImage）。所有安装包都在<a class="link" href="https://github.com/Likemiens/openscreen/releases/latest">发布页面</a>。',
			"faq3.q": "为什么第一次启动时电脑会弹出警告？",
			"faq3.a":
				'安装包暂时还没有代码签名。在 Windows 上，点击“更多信息”，再点击“仍要运行”。在 macOS 上，<a class="link" href="https://github.com/Likemiens/openscreen#macos">安装说明</a>里有一行命令，可以清除隔离标记。',
			"faq4.q": "为什么安装包上写的是 OpenScreen？",
			"faq4.a":
				"Marquee 是 OpenScreen Creator Edition 的新名字。GitHub 上的发布版本暂时还沿用旧名。",
			"faq5.q": "它会上传我的录像吗？",
			"faq5.a":
				"不会。每段片段都保存在你自己的文件夹里。只有点击 Copy link 时才会生成链接，届时只会把这一个文件上传到你的 Yandex Disk。分享不会从文件夹里删除片段。",
			"faq6.q": "能录下摄像头画面和我的声音吗？",
			"faq6.a":
				"可以。麦克风和系统声音在录制器上一键开关，录制窗口或全屏时还可以用画中画加入摄像头。区域片段始终包含光标，但不包含摄像头。",
			"faq7.q": "不用云端，字幕是怎么生成的？",
			"faq7.a":
				"Whisper 在你的电脑上运行。语音模型只在第一次转写时下载一次（GPU 模型约 560 MB，CPU 模型约 250 MB），之后可以离线使用。",
			"faq8.q": "能编辑不是用 Marquee 录的视频吗？",
			"faq8.a":
				"可以。Studio 能打开 MP4、MOV、WebM、MKV 和 AVI 文件：从标题栏打开、把文件拖进编辑器，或从录制器菜单打开。",
			"faq9.q": "稳定吗？",
			"faq9.a":
				'这是一款年轻的软件，难免有些粗糙。如果遇到问题，在 <a class="link" href="https://github.com/Likemiens/openscreen/issues">GitHub 上提 issue</a> 最有帮助。',
			"finale.title": "正在 GitHub 上映",
			"finale.sub": "免费支持 Windows、macOS 和 Linux。",
			"finale.star": "或者给仓库点个星",
			"footer.tagline": "免费开源的录屏工具，适合快速片段，也适合精致演示。",
			"footer.author": "由 <b>Alexandr Varantsov</b> 打造，初衷是解决一个真实的痛点。",
			"footer.label": "页脚导航",
			"footer.product": "产品",
			"f.download": "下载",
			"f.releases": "所有版本",
			"footer.project": "项目",
			"f.source": "源代码",
			"f.issues": "问题反馈",
			"f.contributing": "参与贡献",
			"f.brand": "品牌素材",
			"footer.legal": "法律信息",
			"f.privacy": "隐私",
			"f.original": "原版 OpenScreen",
			"footer.copy": "© 2026 Likemiens。以 MIT 许可证发布。",
			"footer.privacy": "本页面不使用 cookie，也不做任何统计分析。",
			"lang.label": "语言",
			"404.title": "页面不存在 · Marquee",
			"404.eyebrow": "错误 404",
			"404.h": "这一幕被剪掉了。",
			"404.sub": "你要找的页面不在节目单上。回到主舞台只需点一下。",
			"404.cta": "回到主舞台",
			"brand.page": "品牌素材 · Marquee",
			"brand.navHome": "首页",
			"brand.nav": "品牌",
			"brand.h": "围绕录制灯的一圈灯泡",
			"brand.intro":
				"近看，这个标志是一块剧院灯牌。缩小到图标尺寸，它就变成选区的虚线框，正是你框选区域时应用画出的样子。红点就是录制器自己的录制按钮。",
			"brand.mark.h": "标志",
			"brand.mark.p": "用于深色背景。四周请留出一排灯泡宽度的空白。",
			"brand.mark.alt": "Marquee 标志：十八个暖色灯泡组成的圆角框，围着一个红点。",
			"brand.icon.h": "应用图标",
			"brand.icon.p": "石墨色圆角方形，灯泡带柔和光晕。不支持 SVG 的地方请用 PNG。",
			"brand.icon.alt": "Marquee 应用图标：石墨色圆角方块上的标志。",
			"brand.lockup.h": "组合标志",
			"brand.lockup.p": "标志加上用 Geist Semibold 排的名字，已转为轮廓，不需要字体。",
			"brand.lockup.alt": "Marquee 组合标志：标志旁边是 Marquee 字样。",
			"brand.sign.h": "灯牌",
			"brand.sign.p":
				"用 5×7 灯泡点阵拼出的名字，Q 的尾巴是录制灯。用于重要场合：片尾、封面、社交分享卡片。",
			"brand.colors": "颜色",
			"sw.graphite": "石墨",
			"sw.bulb": "灯泡",
			"sw.record": "录制",
			"sw.action": "操作",
			"sw.saved": "已保存",
			"brand.type": "字体：Geist 和 Geist Mono，SIL Open Font License。",
		},
	};

	const root = document.documentElement;
	const lang = root.lang.slice(0, 2);
	for (const a of document.querySelectorAll(".langs a")) {
		if (a.hreflang.slice(0, 2) === lang) a.setAttribute("aria-current", "true");
	}

	const dict = T[lang];
	if (dict) {
		const text = (key) => {
			const t = dict[key];
			if (t === undefined) console.warn(`i18n: "${key}" is missing in ${lang}`);
			return Array.isArray(t) ? t.map((item) => `<li>${item}</li>`).join("") : t;
		};
		for (const el of document.querySelectorAll("[data-i18n]")) {
			const t = text(el.dataset.i18n);
			if (t !== undefined) el.innerHTML = t;
		}
		for (const el of document.querySelectorAll("[data-i18n-attr]")) {
			const [attr, key] = el.dataset.i18nAttr.split(":");
			const t = text(key);
			if (t !== undefined) el.setAttribute(attr, t);
		}
	}
	root.classList.remove("i18n-wait");
})();
