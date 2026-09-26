// Canonical repairs for Python tasks found with missing stdin in September 2026.
// Match original values before replacing, so later teacher edits are retained.
export const PYTHON_CURRICULUM_TEST_REPAIRS = [
  {
    "topic": "102",
    "id": "py102-settings-snapshot",
    "title": "Снимок настроек",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "Тема: тёмная\nЯзык: русский\nУведомления: включены",
        "input": "тёмная\nрусский\nвключены\n",
        "output": "Тема: тёмная\nЯзык: русский\nУведомления: включены"
      },
      {
        "previousInput": "",
        "previousOutput": "Тема: светлая\nЯзык: English\nУведомления: off",
        "input": "светлая\nEnglish\noff\n",
        "output": "Тема: светлая\nЯзык: English\nУведомления: off"
      },
      {
        "previousInput": "",
        "previousOutput": "Тема: тёмная\nЯзык: русский\nУведомления: выключены",
        "input": "тёмная\nрусский\nвыключены\n",
        "output": "Тема: тёмная\nЯзык: русский\nУведомления: выключены"
      }
    ]
  },
  {
    "topic": "102",
    "id": "py102-order-card",
    "title": "Карточка заказа",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "Товар: тетрадь\nКоличество: 3\nЦена: 80",
        "input": "тетрадь\n3\n80\n",
        "output": "Товар: тетрадь\nКоличество: 3\nЦена: 80"
      },
      {
        "previousInput": "",
        "previousOutput": "Товар: ручка\nКоличество: 2\nЦена: 45",
        "input": "ручка\n2\n45\n",
        "output": "Товар: ручка\nКоличество: 2\nЦена: 45"
      },
      {
        "previousInput": "",
        "previousOutput": "Товар: книга\nКоличество: 1\nЦена: 990",
        "input": "книга\n1\n990\n",
        "output": "Товар: книга\nКоличество: 1\nЦена: 990"
      }
    ]
  },
  {
    "topic": "102",
    "id": "py102-transfer-values",
    "title": "Перенос значения",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "синий\nкрасный\nзелёный",
        "input": "красный\nзелёный\nсиний\n",
        "output": "синий\nкрасный\nзелёный"
      },
      {
        "previousInput": "",
        "previousOutput": "C\nA\nB",
        "input": "A\nB\nC\n",
        "output": "C\nA\nB"
      },
      {
        "previousInput": "",
        "previousOutput": "вечер\nутро\nдень",
        "input": "утро\nдень\nвечер\n",
        "output": "вечер\nутро\nдень"
      }
    ]
  },
  {
    "topic": "102",
    "id": "py102-user-profile",
    "title": "Профиль пользователя",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "Иван @Москва [онлайн]",
        "input": "Иван\nМосква\nонлайн\n",
        "output": "Иван @Москва [онлайн]"
      },
      {
        "previousInput": "",
        "previousOutput": "Anna @Omsk [away]",
        "input": "Anna\nOmsk\naway\n",
        "output": "Anna @Omsk [away]"
      },
      {
        "previousInput": "",
        "previousOutput": "Ли @Уфа [новый]",
        "input": "Ли\nУфа\nновый\n",
        "output": "Ли @Уфа [новый]"
      }
    ]
  },
  {
    "topic": "103",
    "id": "py103-role-access",
    "title": "Доступ по роли",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "полный доступ",
        "input": "admin\n",
        "output": "полный доступ"
      },
      {
        "previousInput": "",
        "previousOutput": "обычный доступ",
        "input": "user\n",
        "output": "обычный доступ"
      },
      {
        "previousInput": "",
        "previousOutput": "только просмотр",
        "input": "guest\n",
        "output": "только просмотр"
      },
      {
        "previousInput": "",
        "previousOutput": "только просмотр",
        "input": "guest\n",
        "output": "только просмотр"
      }
    ]
  },
  {
    "topic": "103",
    "id": "py103-weekday",
    "title": "Рабочий или выходной",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "будний",
        "input": "1\n",
        "output": "будний"
      },
      {
        "previousInput": "",
        "previousOutput": "будний",
        "input": "5\n",
        "output": "будний"
      },
      {
        "previousInput": "",
        "previousOutput": "выходной",
        "input": "6\n",
        "output": "выходной"
      },
      {
        "previousInput": "",
        "previousOutput": "выходной",
        "input": "7\n",
        "output": "выходной"
      }
    ]
  },
  {
    "topic": "103",
    "id": "py103-message-length",
    "title": "Длина сообщения",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "подходит",
        "input": "готово к отправке\n",
        "output": "подходит"
      },
      {
        "previousInput": "",
        "previousOutput": "короткое",
        "input": "123456789\n",
        "output": "короткое"
      },
      {
        "previousInput": "",
        "previousOutput": "подходит",
        "input": "1234567890\n",
        "output": "подходит"
      },
      {
        "previousInput": "",
        "previousOutput": "короткое",
        "input": "код\n",
        "output": "короткое"
      }
    ]
  },
  {
    "topic": "103",
    "id": "py103-progress-status",
    "title": "Статус выполнения",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "не начато",
        "input": "0\n",
        "output": "не начато"
      },
      {
        "previousInput": "",
        "previousOutput": "в работе",
        "input": "1\n",
        "output": "в работе"
      },
      {
        "previousInput": "",
        "previousOutput": "в работе",
        "input": "99\n",
        "output": "в работе"
      },
      {
        "previousInput": "",
        "previousOutput": "готово",
        "input": "100\n",
        "output": "готово"
      }
    ]
  },
  {
    "topic": "104",
    "id": "py104-shift-point",
    "title": "Смещение точки",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "1 8",
        "input": "2\n5\n-1\n3\n",
        "output": "1 8"
      },
      {
        "previousInput": "",
        "previousOutput": "4 -2",
        "input": "0\n0\n4\n-2\n",
        "output": "4 -2"
      },
      {
        "previousInput": "",
        "previousOutput": "-1 8",
        "input": "-5\n10\n4\n-2\n",
        "output": "-1 8"
      }
    ]
  },
  {
    "topic": "104",
    "id": "py104-share-equally",
    "title": "Разделить поровну",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "Каждому: 3\nОсталось: 2",
        "input": "17\n5\n",
        "output": "Каждому: 3\nОсталось: 2"
      },
      {
        "previousInput": "",
        "previousOutput": "Каждому: 5\nОсталось: 0",
        "input": "20\n4\n",
        "output": "Каждому: 5\nОсталось: 0"
      },
      {
        "previousInput": "",
        "previousOutput": "Каждому: 2\nОсталось: 1",
        "input": "7\n3\n",
        "output": "Каждому: 2\nОсталось: 1"
      }
    ]
  },
  {
    "topic": "104",
    "id": "py104-bytes-to-kb",
    "title": "Перевод байтов",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "Килобайты: 2\nОстаток: 452",
        "input": "2500\n",
        "output": "Килобайты: 2\nОстаток: 452"
      },
      {
        "previousInput": "",
        "previousOutput": "Килобайты: 1\nОстаток: 0",
        "input": "1024\n",
        "output": "Килобайты: 1\nОстаток: 0"
      },
      {
        "previousInput": "",
        "previousOutput": "Килобайты: 0\nОстаток: 999",
        "input": "999\n",
        "output": "Килобайты: 0\nОстаток: 999"
      }
    ]
  },
  {
    "topic": "104",
    "id": "py104-discount-price",
    "title": "Цена со скидкой",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "Итог: 680.00",
        "input": "800\n15\n",
        "output": "Итог: 680.00"
      },
      {
        "previousInput": "",
        "previousOutput": "Итог: 800.00",
        "input": "1000\n20\n",
        "output": "Итог: 800.00"
      },
      {
        "previousInput": "",
        "previousOutput": "Итог: 89.91",
        "input": "99.9\n10\n",
        "output": "Итог: 89.91"
      }
    ]
  },
  {
    "topic": "105",
    "id": "py105-build-string",
    "title": "Собрать строку",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "code",
        "input": "4\nc\no\nd\ne\n",
        "output": "code"
      },
      {
        "previousInput": "",
        "previousOutput": "123",
        "input": "3\n1\n2\n3\n",
        "output": "123"
      },
      {
        "previousInput": "",
        "previousOutput": "Питон",
        "input": "5\nП\nи\nт\nо\nн\n",
        "output": "Питон"
      }
    ]
  },
  {
    "topic": "105",
    "id": "py105-word-lengths",
    "title": "Длины слов",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "3 6 2",
        "input": "3\ncat\npython\nhi\n",
        "output": "3 6 2"
      },
      {
        "previousInput": "",
        "previousOutput": "4 3 3 6",
        "input": "4\ncode\nfor\nsum\npython\n",
        "output": "4 3 3 6"
      },
      {
        "previousInput": "",
        "previousOutput": "1 5",
        "input": "2\na\napple\n",
        "output": "1 5"
      }
    ]
  },
  {
    "topic": "105",
    "id": "py105-filter-by-length",
    "title": "Фильтр по длине",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "2",
        "input": "4\nдом\nмашина\nкод\nцикл\n",
        "output": "1"
      },
      {
        "previousInput": "",
        "previousOutput": "3",
        "input": "4\napple\npython\nhello\nx\n",
        "output": "3"
      },
      {
        "previousInput": "",
        "previousOutput": "2",
        "input": "3\n12345\n1234\n123456\n",
        "output": "2"
      }
    ]
  },
  {
    "topic": "105",
    "id": "py105-longest-word",
    "title": "Самое длинное слово",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "алгоритм",
        "input": "4\nкод\nалгоритм\nцикл\nстрока\n",
        "output": "алгоритм"
      },
      {
        "previousInput": "",
        "previousOutput": "green",
        "input": "4\nred\ngreen\nblack\nblue\n",
        "output": "green"
      },
      {
        "previousInput": "",
        "previousOutput": "cat",
        "input": "3\ncat\ndog\nowl\n",
        "output": "cat"
      }
    ]
  },
  {
    "topic": "106",
    "id": "py106-remove-vowels",
    "title": "Убрать гласные",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "Првт, Pythn!",
        "input": "Привет, Python!\n",
        "output": "Првт, Pythn!"
      },
      {
        "previousInput": "",
        "previousOutput": "lg rthm",
        "input": "algo rithm\n",
        "output": "lg rthm"
      },
      {
        "previousInput": "",
        "previousOutput": " рз пл н лп зр",
        "input": "А роза упала на лапу Азора\n",
        "output": " рз пл н лп зр"
      }
    ]
  },
  {
    "topic": "106",
    "id": "py106-palindrome",
    "title": "Палиндром",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "да",
        "input": "А роза упала на лапу Азора\n",
        "output": "да"
      },
      {
        "previousInput": "",
        "previousOutput": "нет",
        "input": "Python\n",
        "output": "нет"
      },
      {
        "previousInput": "",
        "previousOutput": "да",
        "input": "Топот\n",
        "output": "да"
      },
      {
        "previousInput": "",
        "previousOutput": "да",
        "input": "а\n",
        "output": "да"
      }
    ]
  },
  {
    "topic": "106",
    "id": "py106-collapse-spaces",
    "title": "Сжать пробелы",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "учим Python вместе",
        "input": "  учим   Python  вместе \n",
        "output": "учим Python вместе"
      },
      {
        "previousInput": "",
        "previousOutput": "одна строка",
        "input": "одна    строка\n",
        "output": "одна строка"
      },
      {
        "previousInput": "",
        "previousOutput": "много пробелов",
        "input": "   много     пробелов   \n",
        "output": "много пробелов"
      }
    ]
  },
  {
    "topic": "106",
    "id": "py106-neighbor-pairs",
    "title": "Соседние пары",
    "tests": [
      {
        "previousInput": "",
        "previousOutput": "c-o-d-e",
        "input": "code\n",
        "output": "c-o-d-e"
      },
      {
        "previousInput": "",
        "previousOutput": "1-2-3-4-5",
        "input": "12345\n",
        "output": "1-2-3-4-5"
      },
      {
        "previousInput": "",
        "previousOutput": "А-Б-В",
        "input": "АБВ\n",
        "output": "А-Б-В"
      }
    ]
  }
];
