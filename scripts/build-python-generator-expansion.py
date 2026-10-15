"""Additional practice for the existing standalone Generators card (112).

These tasks differ from the 24 introductory comprehensions in Lists. Reference
solutions need only material through lists; audit oracles may use other tools.
"""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RNG = random.Random(11220261015)
QUESTIONS = []
AUDIT = []
SECTIONS = ['Преобразование и отбор', 'Работа с индексами', 'Вложенные генераторы']
PREREQUISITES = 'ввод, арифметика, условия, циклы, строки, списки, генераторы списков; без кортежей, функций и библиотек'
NUM = 'values = list(map(int, input().split()))'
WORDS = 'words = input().split()'
RULE = ' Результат постройте генератором списка [выражение for ...], при необходимости с if.'


def lines(*values):
    return '\n'.join(map(str, values)) + '\n'


def joined(values):
    return ' '.join(map(str, values))


def task(section, slug, title, goal, statement, input_format, output_format,
         starter, reference, examples, oracle, encode, extra=()):
    cases = []
    seen = set()
    for example in list(examples) + list(extra):
        stdin = encode(example)
        if stdin in seen:
            continue
        seen.add(stdin)
        cases.append({'input': stdin, 'output': str(oracle(example))})
    assert len(cases) >= 4, title
    ident = 'py-gen-expand-20261015-112-' + slug
    question = '\n\n'.join([
        statement + RULE,
        'Формат входных данных:\n' + input_format,
        'Формат выходных данных:\n' + output_format,
        'Тренируем: ' + goal + '.',
        'Пример:\nВвод:\n' + cases[0]['input'].rstrip('\n') + '\nВывод:\n' + cases[0]['output'],
    ])
    QUESTIONS.append({'topic':'112', 'sectionTitle':SECTIONS[section],
                      'question':{'id':ident, 'title':title, 'question':question,
                                  'starterCode':starter+'\n\n# Напишите решение\n', 'tests':cases[:10]}})
    AUDIT.append({'id':ident, 'topic':112, 'stage':108, 'requiresListComp':True,
                  'title':title, 'section':SECTIONS[section], 'learningGoal':goal,
                  'prerequisites':PREREQUISITES, 'reference':reference+'\n', 'cases':cases})


lists = [[-4,0,3,-2], [0], [-1], [1,2,3], [-3,-3,-1], [-9,2,0,7,-8], [4,4], [-100,100]]
random_lists = [[RNG.randint(-100,100) for _ in range(RNG.randint(1,20))] for _ in range(10)]
enc_nums = lambda a: lines(joined(a))
enc_nums_k = lambda a: lines(joined(a[0]),a[1])
enc_words = lambda a: lines(' '.join(a))
enc_words_k = lambda a: lines(' '.join(a[0]),a[1])
words = [['Level','code','a','radar'], ['Python'], ['AA','Bb','c'], ['топот','Дом','Око'],
         ['one','two','one'], ['X'], ['ab','BA'], ['ABC','aba','b']]

task(0,'negative-squares','Квадраты только отрицательных',
     'порядок фильтрации и вычисления нового значения',
     'Выберите строго отрицательные числа и возведите выбранные числа в квадрат. Сохраните исходный порядок и повторы.',
     'Непустой список до 100 целых чисел от -1000 до 1000.',
     'Квадраты через пробел или пустая строка, если отрицательных нет.', NUM,
     NUM+'\nresult = [x*x for x in values if x < 0]\nprint(*result)', lists,
     lambda a: joined(pow(x,2) for x in filter(lambda v:v<0,a)), enc_nums, random_lists)

task(0,'boxes','Коробки для каждой партии',
     'целочисленное округление вверх внутри генератора',
     'Каждую партию из списка упаковывают отдельно. В коробку помещается K предметов. Для каждой партии найдите минимальное число коробок; для нулевой партии нужно 0 коробок.',
     'Список из 1..100 размеров партий (целые 0..1000000), затем K от 1 до 1000 на новой строке.',
     'Число коробок для каждой партии через пробел.', NUM+'\nk = int(input())',
     NUM+'\nk = int(input())\nresult = [(x+k-1)//k for x in values]\nprint(*result)',
     [([0,1,4,5,8],4),([1],1),([0],9),([9,10,11],10),([12,12],3),([1000000],1000),([7],1000),([3,2,1],2)],
     lambda a: joined(x//a[1]+(x%a[1]!=0) for x in a[0]), enc_nums_k,
     [([RNG.randrange(1000) for _ in range(12)],RNG.randint(1,100)) for _ in range(8)])

task(0,'score-bands','Три уровня результата',
     'отличие условного выражения от фильтра и границы диапазонов',
     'Для каждого балла выведите уровень: LOW для 0..49, MID для 50..79, HIGH для 80..100. Нельзя удалять баллы: каждому входному числу соответствует одна метка.',
     'От 1 до 100 целых баллов от 0 до 100 на одной строке.', 'Метки через пробел.', NUM,
     NUM+'\nresult = ["LOW" if x < 50 else "MID" if x < 80 else "HIGH" for x in values]\nprint(*result)',
     [[49,50,79,80],[0],[100],[50],[79],[80],[0,100,49,50,79,80],[75,75]],
     lambda a: ' '.join('LOW' if x in range(50) else 'MID' if x in range(50,80) else 'HIGH' for x in a),
     enc_nums, [[RNG.randrange(101) for _ in range(15)] for _ in range(8)])

task(0,'palindrome-words','Слова-зеркала без учёта регистра',
     'нормализацию строки перед сравнением с обратным порядком',
     'Оставьте слова-палиндромы без учёта регистра. В ответе переведите выбранные слова в нижний регистр. Однобуквенное слово тоже палиндром.',
     'От 1 до 100 непустых слов из русских или английских букв через пробел.', 'Слова через пробел или пустая строка.', WORDS,
     WORDS+'\nresult = [w.lower() for w in words if w.lower() == w.lower()[::-1]]\nprint(*result)', words,
     lambda a:' '.join(w.lower() for w in a if all(w[i].lower()==w[-1-i].lower() for i in range(len(w)))), enc_words)

task(0,'python-basenames','Имена файлов Python без расширения',
     'фильтр по точному суффиксу и безопасный срез',
     'Оставьте имена, заканчивающиеся ровно на .py (регистр важен), и удалите эти три последних символа. Например, app.py.py превращается в app.py. Во всех именах перед расширением есть хотя бы один символ.',
     'От 1 до 100 имён без пробелов; длина каждого 4..100 символов.', 'Имена без последнего .py через пробел или пустая строка.', WORDS,
     WORDS+'\nresult = [w[:-3] for w in words if w.endswith(".py")]\nprint(*result)',
     [['app.py','notes.txt','app.py.py'],['x.PY'],['x.py'],['x.pyc','y.py'],['test.txt'],['a.py','a.py'],['a.py.tmp','b.py'],['my-file.py','код.py']],
     lambda a:' '.join(w[:len(w)-3] for w in a if w[len(w)-3:]=='.py'),enc_words)

task(0,'double-digits','Удвоенные цифры из сообщения',
     'отбор символов перед преобразованием строки в число',
     'Из сообщения выберите символы-цифры 0..9 и каждую выбранную цифру умножьте на 2. Числа из нескольких соседних цифр не объединяйте: из a12 получится 2 4.',
     'Одна строка длиной 0..1000 из латинских букв, цифр и пробелов.', 'Удвоенные цифры через пробел или пустая строка.', 'text = input()',
     'text = input()\nresult = [int(ch)*2 for ch in text if "0" <= ch <= "9"]\nprint(*result)',
     ['a12 b0','9','','abc','000','1 3 5','99x2','0a9'],
     lambda s:joined('0123456789'.index(c)*2 for c in filter(str.isdigit,s)),lambda s:lines(s))

task(0,'word-range','Слова в диапазоне длин',
     'двусторонний фильтр и преобразование отобранных строк',
     'Оставьте слова длиной от L до R включительно и переведите их в нижний регистр. Порядок и повторы сохраните.',
     'От 1 до 100 слов из букв, затем L и R на отдельных строках; 1 ≤ L ≤ R ≤ 100.', 'Слова через пробел или пустая строка.',
     WORDS+'\nleft = int(input())\nright = int(input())',
     WORDS+'\nleft = int(input())\nright = int(input())\nresult = [w.lower() for w in words if left <= len(w) <= right]\nprint(*result)',
     [(['A','BB','ccc','DDDD'],2,3),(['abc'],4,5),(['AbC'],3,3),(['a','B'],1,1),(['Code','code'],1,100),(['я','Дом','тест'],1,3),(['a','bb'],2,2),(['x'],1,100)],
     lambda a:' '.join(map(str.lower,filter(lambda w:len(w) in range(a[1],a[2]+1),a[0]))),lambda a:lines(' '.join(a[0]),a[1],a[2]))

task(0,'consonant-lengths','Длины слов с согласной на конце',
     'проверку последнего символа и смену типа результата',
     'Выберите слова, заканчивающиеся на английскую согласную без учёта регистра, и выведите их длины. Буква y здесь считается согласной.',
     'От 1 до 100 непустых слов только из латинских букв.', 'Длины выбранных слов через пробел или пустая строка.', WORDS,
     WORDS+'\nresult = [len(w) for w in words if w[-1].lower() not in "aeiou"]\nprint(*result)',
     [['Code','cat','sky','A'],['a'],['X'],['HELLO','world'],['y','b','U'],['one','two'],['aaB','bbaa'],['test','test']],
     lambda a:joined(len(w) for w in a if w.lower()[-1] in 'bcdfghjklmnpqrstvwxyz'),enc_words)

task(1,'peaks','Индексы строгих вершин',
     'безопасный диапазон индексов и сравнение с двумя соседями',
     'Найдите индексы элементов, которые строго больше обоих непосредственных соседей. Крайние элементы не рассматриваются. Индексы начинаются с 0.',
     'Непустой список до 100 целых чисел от -1000 до 1000.', 'Индексы через пробел или пустая строка.', NUM,
     NUM+'\nresult = [i for i in range(1,len(values)-1) if values[i] > values[i-1] and values[i] > values[i+1]]\nprint(*result)',
     [[1,5,2,6,3],[9],[1,2],[1,1,1],[1,2,2,1],[-3,-1,-2],[3,2,1],[0,1,0,1,0]],
     lambda a:joined(i for i in range(len(a)) if 0<i<len(a)-1 and max(a[i-1:i+2])==a[i] and a[i-1:i+2].count(a[i])==1),enc_nums,random_lists)

task(1,'drop-indices','Убрать индексы, кратные K',
     'различие значения элемента и его индекса при фильтрации',
     'Удалите элементы, чьи индексы делятся на K без остатка. Индексация с 0, поэтому элемент с индексом 0 всегда удаляется. Значения самих элементов на отбор не влияют.',
     'Непустой список до 100 целых чисел, затем K от 1 до 100.', 'Оставшиеся значения через пробел или пустая строка.', NUM+'\nk = int(input())',
     NUM+'\nk = int(input())\nresult = [values[i] for i in range(len(values)) if i % k != 0]\nprint(*result)',
     [([9,8,7,6,5],2),([4],10),([1,2,3],1),([0,0,0,0],3),([7,7],9),([2,4,6,8],3),([-1,0,1],2),([1,2,3,4,5],5)],
     lambda a:joined(v for i,v in enumerate(a[0]) if i not in range(0,len(a[0]),a[1])),enc_nums_k)

task(1,'circular-pick','Несколько шагов по кругу',
     'получение элемента по вычисленному индексу с остатком',
     'Начните с индекса S и выпишите K элементов, двигаясь по списку вправо. После последнего элемента возвращайтесь к первому; повторные обходы разрешены.',
     'Непустой список до 30 целых чисел, затем S (0 ≤ S < длина) и K (0..100) на отдельных строках.', 'K значений через пробел, при K = 0 пустая строка.',
     NUM+'\nstart = int(input())\nk = int(input())',
     NUM+'\nstart = int(input())\nk = int(input())\nresult = [values[(start+i)%len(values)] for i in range(k)]\nprint(*result)',
     [([1,2,3],2,5),([7],0,4),([1,2],1,0),([1,2],0,2),([9,8,7],1,1),([1,2,3],0,7),([-1,0,1],2,3),([4],0,0)],
     lambda a:joined((a[0]*101)[a[1]:a[1]+a[2]]),lambda a:lines(joined(a[0]),a[1],a[2]))

task(1,'numbered-words','Пронумеровать слова',
     'различие индекса с 0 и номера с 1 в строковом выражении',
     'Перед каждым словом поставьте его номер с 1 и двоеточие без пробелов. Например: 1:кот 2:дом. Регистр слов сохраните.',
     'От 1 до 100 непустых слов через пробел.', 'Пронумерованные слова через пробел.', WORDS,
     WORDS+'\nresult = [str(i+1)+":"+words[i] for i in range(len(words))]\nprint(*result)',words,
     lambda a:' '.join(f'{i}:{w}' for i,w in enumerate(a,1)),enc_words)

paired = [([5,8,-5],[2,0,2]),([1],[0]),([0],[3]),([-5,-1],[2,3]),([9,9],[3,3]),([1,2],[1,2]),([7],[8]),([0,4,8],[1,2,4])]
pair_start = 'first = list(map(int,input().split()))\nsecond = list(map(int,input().split()))'
pair_encode = lambda a: lines(joined(a[0]),joined(a[1]))
task(1,'safe-quotients','Частные без деления на ноль',
     'общий индекс двух списков и фильтр до вычисления опасного выражения',
     'Даны два списка одинаковой длины. Для каждой позиции, где второй элемент не равен нулю, получите first[i] // second[i]. Пропустите позиции с нулём во втором списке. Используется именно целочисленное деление Python, в том числе для отрицательных чисел.',
     'Два списка длиной 1..100: первый из целых -1000..1000, второй из целых 0..1000.', 'Частные через пробел или пустая строка.',pair_start,
     pair_start+'\nresult = [first[i]//second[i] for i in range(len(first)) if second[i] != 0]\nprint(*result)',paired,
     lambda a:joined(__import__('math').floor(x/y) for x,y in zip(*a) if y),pair_encode)

task(1,'changes','Изменения между измерениями',
     'построение списка на один элемент короче исходного и знак разности',
     'Для каждой пары соседних измерений вычислите следующее минус предыдущее. Для списка из одного элемента результат пустой.',
     'Непустой список до 100 целых измерений от -1000 до 1000.', 'Разности через пробел или пустая строка.',NUM,
     NUM+'\nresult = [values[i]-values[i-1] for i in range(1,len(values))]\nprint(*result)',lists,
     lambda a:joined(b-a for a,b in zip(a,a[1:])),enc_nums,random_lists)

task(1,'series-starts','Где начинается новая серия',
     'короткое замыкание or и отбор границ одинаковых серий',
     'Выведите индексы начала всех непрерывных серий одинаковых чисел. Первая серия всегда начинается с индекса 0. Для 5 5 2 2 5 ответ 0 2 4.',
     'Непустой список до 100 целых чисел.', 'Индексы через пробел.',NUM,
     NUM+'\nresult = [i for i in range(len(values)) if i == 0 or values[i] != values[i-1]]\nprint(*result)',
     [[5,5,2,2,5],[7],[1,1,1],[1,2,3],[0,0,1,0],[-1,-1,0],[2,1,2],[1,2,2,1]],
     lambda a:joined([0]+[i+1 for i,(x,y) in enumerate(zip(a,a[1:])) if x!=y]),enc_nums,random_lists)

task(1,'triple-windows','Суммы трёх соседних',
     'границы скользящего окна фиксированной длины',
     'Получите суммы всех троек соседних элементов: сначала элементы с индексами 0,1,2, затем 1,2,3 и так далее. Если элементов меньше трёх, ответ пустой.',
     'Непустой список до 100 целых чисел от -1000 до 1000.', 'Суммы через пробел или пустая строка.',NUM,
     NUM+'\nresult = [values[i]+values[i+1]+values[i+2] for i in range(len(values)-2)]\nprint(*result)',
     [[1,2,3,4],[1],[1,2],[0,0,0],[-1,-2,-3,-4],[7,7,7,7],[1,-1,1,-1,1],[1,2,3]],
     lambda a:joined(sum(a[i:i+3]) for i in range(max(0,len(a)-2))),enc_nums,random_lists)

task(2,'position-pairs','Все пары разных позиций',
     'зависимую правую границу вложенного перебора и порядок пар',
     'Для каждой пары индексов i < j выведите значения values[i]:values[j]. Сначала идут все пары с i = 0 по возрастанию j, затем с i = 1 и так далее. Равные значения на разных позициях образуют пару; повторы ответа сохраняйте.',
     'Список из 1..30 целых чисел.', 'Пары через пробел или пустая строка.',NUM,
     NUM+'\nresult = [str(values[i])+":"+str(values[j]) for i in range(len(values)) for j in range(i+1,len(values))]\nprint(*result)',
     [[1,2,3],[5],[2,2],[1,2],[-1,0,1],[3,2,1],[0,0,0],[4,5,6,7]],
     lambda a:' '.join(f'{x}:{y}' for i,x in enumerate(a) for y in a[i+1:]),enc_nums)

task(2,'digit-triples','Неубывающие тройки цифр',
     'три вложенных for с зависимыми диапазонами и условием',
     'Найдите все тройки цифр a,b,c, для которых 0 ≤ a ≤ b ≤ c ≤ 9 и a+b+c = S. Выводите каждую тройку слитно (например, 019) по возрастанию a, затем b, затем c. Ведущие нули сохраняйте.',
     'Целое S от 0 до 27.', 'Тройки через пробел.', 'target = int(input())',
     'target = int(input())\nresult = [str(a)+str(b)+str(c) for a in range(10) for b in range(a,10) for c in range(b,10) if a+b+c == target]\nprint(*result)',
     [1,0,27,26,9,10,18,3,6,24],
     lambda s:' '.join(''.join(map(str,p)) for p in __import__('itertools').combinations_with_replacement(range(10),3) if sum(p)==s),lambda s:lines(s),range(28))

task(2,'divisor-labels','Делители для каждого числа',
     'вложенный диапазон, зависящий от текущего элемента',
     'Для каждого числа из входа найдите все его положительные делители по возрастанию. Для каждого делителя d запишите число:d. Обрабатывайте исходные числа по порядку, повторы сохраняйте.',
     'Список из 1..20 положительных целых чисел от 1 до 100.', 'Подписи через пробел.',NUM,
     NUM+'\nresult = [str(x)+":"+str(d) for x in values for d in range(1,x+1) if x % d == 0]\nprint(*result)',
     [[6,1,4],[1],[7],[9],[2,2],[10,12],[100],[3,5]],
     lambda a:' '.join(f'{x}:{d}' for x in a for d in range(1,101) if x/d==x//d),enc_nums,
     [[RNG.randint(1,100) for _ in range(5)] for _ in range(8)])

two_words = 'first = input().split()\nsecond = input().split()'
task(2,'same-initial','Пары слов с общей первой буквой',
     'декартов перебор строк и нормализацию только сравниваемых букв',
     'Составьте все пары слово1/слово2 из двух строк, у которых первые буквы совпадают без учёта регистра. Сами слова в ответе сохраните как во входе. Сначала перебирайте первое слово, внутри — второе. Повторы сохраняются.',
     'Две непустые строки, в каждой 1..20 непустых слов из букв.', 'Пары через пробел или пустая строка.',two_words,
     two_words+'\nresult = [a+"/"+b for a in first for b in second if a[0].lower() == b[0].lower()]\nprint(*result)',
     [(['Cat','dog'],['code','Door','Apple']),(['a'],['b']),(['A'],['a']),(['дом','код'],['День','Кот']),(['x','x'],['X']),(['a','ab'],['A','abc']),(['B'],['b','B']),(['aa','bb'],['cc'])],
     lambda a:' '.join(x+'/'+y for x,y in __import__('itertools').product(*a) if x.lower().startswith(y[0].lower())),lambda a:lines(' '.join(a[0]),' '.join(a[1])))

task(2,'lines-to-words','Длинные слова из нескольких строк',
     'плоский результат двух переборов без потери порядка строк',
     'Из N строк текста соберите в один плоский список только слова длиной не меньше K. Порядок строк и слов сохраните. Строки могут быть пустыми; разделение на слова выполняется split().',
     'N от 1 до 10, затем K от 1 до 100, затем ровно N строк из букв и пробелов (каждая до 1000 символов).',
     'Все выбранные слова через пробел или пустая строка.', 'n = int(input())\nk = int(input())\ntexts = [input() for _ in range(n)]',
     'n = int(input())\nk = int(input())\ntexts = [input() for _ in range(n)]\nresult = [word for text in texts for word in text.split() if len(word) >= k]\nprint(*result)',
     [(['a bb','ccc d'],2),([''],1),(['a','b'],2),([' Code  Python ','','я дом'],3),(['abc'],3),(['x','x'],1),([' aa','bb '],2),(['   ','abc'],1)],
     lambda a:' '.join(filter(lambda w:len(w)>=a[1], '\n'.join(a[0]).split())),lambda a:lines(len(a[0]),a[1],*a[0]))

task(2,'digit-checksums','Контрольные суммы номеров',
     'вложенный генератор для отдельного промежуточного списка',
     'Для каждого неотрицательного целого числа получите сумму его десятичных цифр. Ноль имеет сумму цифр 0. Создайте внутренним генератором список цифр, а внешним — список их сумм.',
     'Список из 1..100 целых чисел от 0 до 1000000000.', 'Суммы цифр через пробел.',NUM,
     NUM+'\nresult = [sum([int(ch) for ch in str(x)]) for x in values]\nprint(*result)',
     [[120,0,99],[0],[7],[1000000000],[909,111],[42,42],[10,100,1000],[123456789]],
     lambda a:joined(sum(x//(10**i)%10 for i in range(10)) for x in a),enc_nums,
     [[RNG.randrange(1000000001) for _ in range(12)] for _ in range(8)])

task(2,'nearby-pairs','Пары с ограниченной разницей',
     'составной фильтр в двойном переборе',
     'Составьте все пары a:b, где a из первого списка, b из второго и 1 ≤ b-a ≤ K. Сначала перебирайте a в исходном порядке, внутри — b в исходном порядке. Повторы сохраняйте.',
     'Два непустых списка длиной до 30 из целых -1000..1000, затем K от 0 до 1000 на новой строке.',
     'Пары через пробел или пустая строка.',pair_start+'\nk = int(input())',
     pair_start+'\nk = int(input())\nresult = [str(a)+":"+str(b) for a in first for b in second if 1 <= b-a <= k]\nprint(*result)',
     [([1,3],[1,2,4,6],2),([1],[1],1),([0],[1],0),([-2,0],[-1,1],1),([1,1],[2,2],1),([3],[4],1),([3],[5],1),([0],[5],5)],
     lambda a:' '.join(f'{x}:{y}' for x,y in __import__('itertools').product(a[0],a[1]) if y in range(x+1,x+a[2]+1)),lambda a:lines(joined(a[0]),joined(a[1]),a[2]))

task(2,'word-windows','Окна внутри каждого слова',
     'зависимый внутренний диапазон и перекрывающиеся срезы',
     'Для каждого слова выпишите все его подстроки длины K слева направо. Подстроки могут пересекаться. Слова короче K ничего не добавляют. Например, из abcd при K=2 получатся ab bc cd.',
     'От 1 до 30 непустых слов из букв (каждое до 100 символов), затем K от 1 до 100 на новой строке.',
     'Все подстроки в порядке слов через пробел или пустая строка.',WORDS+'\nk = int(input())',
     WORDS+'\nk = int(input())\nresult = [word[i:i+k] for word in words for i in range(len(word)-k+1)]\nprint(*result)',
     [(['abcd','xy','a'],2),(['x'],2),(['abc'],3),(['aa','b'],1),(['aaaa'],2),(['дом','кот'],2),(['a','bb'],3),(['ab','cd'],2)],
     lambda a:' '.join(w[i:i+a[1]] for w in a[0] for i in range(len(w)) if len(w[i:i+a[1]])==a[1]),enc_words_k)


def main():
    assert len(QUESTIONS)==24
    assert len({q['question']['id'] for q in QUESTIONS})==24
    payload = {'version':'20261015-generators','topics':{'112':{'title':'Генераторы','added':24}},'questions':QUESTIONS}
    (ROOT/'server/pythonGeneratorExpansionData.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'output/python-generator-expansion-audit-input.json').write_text(json.dumps(AUDIT,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    report = ['# Дополнительная практика в карточке «Генераторы» — 15 октября 2026','',
              '24 отдельные задачи в существующей карточке 112. Они дополняют 24 вводные задачи в подразделе списков. Все эталонные решения обходятся материалом, изученным до кортежей: кортежи, функции, рекурсия, библиотеки и yield не нужны.','',
              'Условия требуют практиковать генераторы списков. Действующая автопроверка оценивает вывод, а не запрещает другие корректные решения.','',
              '| Задача | Подраздел | Что тренирует | Тестов на сайте / всего проверок |','|---|---|---|---|']
    for q in AUDIT:
        report.append(f"| {q['title']} | {q['section']} | {q['learningGoal']} | {min(10,len(q['cases']))} / {len(q['cases'])} |")
    (ROOT/'docs/python-generator-expansion-20261015.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
    print(json.dumps({'questions':24,'cases':sum(len(t['cases']) for t in AUDIT),'publicCases':sum(len(t['question']['tests']) for t in QUESTIONS)}))


if __name__=='__main__':
    main()
