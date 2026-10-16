"""Second append-only authoring batch. Oracles are independent of student code.

Every task has two ordinary, stage-limited student solutions. They are private
audit artifacts, never fields in the published question bank.
"""
import json
import math
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RNG = random.Random(20261016)
QUESTIONS, AUDIT = [], []
TOPICS = {101:'Ввод и вывод данных',102:'Переменные',103:'Условия',104:'Вычисления',105:'Цикл for',106:'Строки',107:'Цикл while',108:'Списки',112:'Генераторы'}
SECTIONS = {
101:['Ввод строк','Ввод чисел','Форматирование ответа'],
102:['Хранение данных','Типы и преобразования','Обновление переменной','Несколько переменных'],
103:['Простой выбор','Несколько вариантов','Составные условия','Условия со строками','Проверка данных'],
104:['Операции и типы','Целочисленное деление','Точность и округление','Изменение значений','Составные вычисления'],
105:['range() и шаг','Накопители','Условия и счётчики','Максимум и серии','Поиск и проверки','Вложенные циклы'],
106:['Индексы и срезы','Методы строк','Проверка содержимого','Анализ символов','Сборка новой строки'],
107:['Цикл до сигнала','Счётчик цикла','Обработка цифр','Движение к цели','Проверка и поиск'],
108:['Создание и доступ','Фильтрация и замена','Методы и порядок','Соседние элементы','Индексы и изменение'],
112:['Преобразование и отбор','Работа с индексами','Вложенные генераторы']}

def joined(values):
    return ' '.join(map(str,values))

def encode(args):
    return '\n'.join(joined(x) if isinstance(x,list) else str(x) for x in args)+'\n'

def add(topic,section,slug,title,goal,statement,fmt,output,solutions,cases,oracle,encode_case=encode):
    # A missing filter/incorrect range can insert invisible empty strings. For
    # these tasks the element count makes that real mistake testable as well.
    counted=topic==112 and slug in {'clean-nonempty','reversed-prefixes','word-prefixes','word-repeat-stairs'}
    if counted:
        output='На первой строке количество элементов результата. На второй — элементы через пробел (строка может быть пустой).'
        solutions=re.sub(r'print\(\*(\w+)\)',r'print(len(\1))\nprint(*\1)',solutions)
    ident=f'py-more-20261016-{topic}-{slug}'
    rows=[]
    for args in cases:
        stdin=encode_case(args)
        if any(row['input']==stdin for row in rows): continue
        expected=str(oracle(*args))
        if counted:
            expected=str(len(expected.split()))+'\n'+expected
        rows.append({'input':stdin,'output':expected})
    assert len(rows)>=6,(title,len(rows))
    references=[code.strip()+'\n' for code in solutions.split('\n---\n')]
    assert len(references)==2,title
    section_title=SECTIONS[topic][section]
    if topic==112: statement+=' Постройте результат генератором списка [выражение for ...], при необходимости с условием if.'
    question='\n\n'.join([statement,'Формат входных данных:\n'+fmt,'Формат выходных данных:\n'+output,'Тренируем: '+goal+'.',
        'Пример:\nВвод:\n'+rows[0]['input'].rstrip('\n')+'\nВывод:\n'+(rows[0]['output'] or '(пустая строка)')])
    QUESTIONS.append({'topic':str(topic),'sectionTitle':section_title,'question':{'id':ident,'title':title,'question':question,'starterCode':'# Считайте данные и решите задачу\n','tests':rows[:16]}})
    AUDIT.append({'id':ident,'topic':topic,'stage':108 if topic==112 else topic,'requiresListComp':topic==112,'title':title,'section':section_title,
        'learningGoal':goal,'prerequisites':'текущая и предыдущие темы; без кортежей, функций и библиотек',
        'reference':references[0],'studentSolutions':references,'cases':rows})

TEXTS=[('Лена','робот'),('А','Б'),('два слова','три слова'),('0','001'),('Ёж','ёж'),('Python','3.13'),('x-y','z!'),('Кот','дом')]
NUMS=[(0,0),(1,2),(9,1),(2,9),(-5,3),(3,-5),(-4,-4),(1000,7)]

# I/O: no branches, methods, indexing or loops.
add(101,0,'badge','Бейдж для участника','чтение строк и точную многострочную подпись',
    'Считайте имя и роль. Выведите имя после «Участник: », затем роль после «Роль: ». На третьей строке напечатайте «Добро пожаловать, Имя!».',
    'Две непустые строки: имя, затем роль.','Три строки; перед ! пробела нет.',
    r'''name=input()
role=input()
print("Участник:",name)
print("Роль:",role)
print("Добро пожаловать, ",name,"!",sep="")
---
name=input()
role=input()
print("Участник: "+name)
print("Роль: "+role)
print("Добро пожаловать, "+name+"!")''',TEXTS,lambda a,b:f'Участник: {a}\nРоль: {b}\nДобро пожаловать, {a}!')
add(101,0,'quotation','Собрать короткий диалог','чтение по порядку и оформление реплик',
    'Считайте два имени. Напечатайте «Первое: Привет, Второе!» и «Второе: Привет, Первое!», заменив Первое и Второе именами.',
    'Два имени на отдельных строках.','Две реплики.',
    r'''a=input()
b=input()
print(a,": Привет, ",b,"!",sep="")
print(b,": Привет, ",a,"!",sep="")
---
a=input()
b=input()
print(a+": Привет, "+b+"!")
print(b+": Привет, "+a+"!")''',TEXTS,lambda a,b:f'{a}: Привет, {b}!\n{b}: Привет, {a}!')
add(101,0,'same-lines','Название на трёх строках','повторное использование одной считанной строки',
    'Считайте название. Выведите его на трёх строках: сначала без добавлений, затем между знаками < и >, затем после «Это: ».',
    'Одна непустая строка.','Три строки.',
    r'''s=input()
print(s)
print("<",s,">",sep="")
print("Это:",s)
---
s=input()
print(s+"\n<"+s+">\nЭто: "+s)''',[(x,) for x,_ in TEXTS],lambda s:f'{s}\n<{s}>\nЭто: {s}')
add(101,1,'two-rows','Два ряда мест','преобразование двух входов и несколько числовых результатов',
    'В первом ряду A мест, во втором B. Выведите общее число мест и затем разность A - B.',
    'A и B на разных строках, целые от 0 до 1000.','Сумма и разность на отдельных строках.',
    r'''a=int(input())
b=int(input())
print(a+b)
print(a-b)
---
a=int(input())
b=int(input())
total=a+b
difference=a-b
print(total,difference,sep="\n")''',[(abs(a),abs(b)) for a,b in NUMS]+[(1000,1000)],lambda a,b:f'{a+b}\n{a-b}')
add(101,1,'rect-label','Площадь с подписью','числовое умножение и вывод единиц измерения',
    'Считайте длину и ширину прямоугольника. Выведите «Площадь: S кв.м», где S — их произведение.',
    'Два целых числа от 1 до 1000 на разных строках.','Строка с площадью.',
    r'''a=int(input())
b=int(input())
print("Площадь:",a*b,"кв.м")
---
length=int(input())
width=int(input())
area=length*width
print("Площадь: ",area," кв.м",sep="")''',[(1,1),(1,9),(9,1),(2,3),(12,10),(1000,1000),(7,11)],lambda a,b:f'Площадь: {a*b} кв.м')
add(101,1,'two-purchases','Сумма двух покупок','раздельное чтение нескольких чисел',
    'Первая покупка стоит A рублей за штуку, взяли N штук. Вторая стоит B рублей за штуку, взяли M штук. Выведите общую стоимость.',
    'A, N, B, M — четыре целых числа от 0 до 1000, каждое на новой строке.','Одно целое число.',
    r'''a=int(input())
n=int(input())
b=int(input())
m=int(input())
print(a*n+b*m)
---
price1=int(input())
count1=int(input())
price2=int(input())
count2=int(input())
first=price1*count1
second=price2*count2
print(first+second)''',[(2,3,5,4),(0,2,3,0),(1,1,1,1),(8,0,1,3),(2,7,7,2),(1000,1000,1000,1000),(3,4,5,6)],lambda a,n,b,m:sum([a*n,b*m]))
add(101,2,'custom-route','Маршрут с остановкой','одинаковый разделитель между тремя значениями',
    'Считайте начало, остановку и конец маршрута. Выведите их в одной строке через « -> ».',
    'Три непустые строки.','Одна строка с маршрутом.',
    r'''a=input()
b=input()
c=input()
print(a,b,c,sep=" -> ")
---
a=input()
b=input()
c=input()
print(a+" -> "+b+" -> "+c)''',[(a,b,a) for a,b in TEXTS],lambda a,b,c:' -> '.join([a,b,c]))
add(101,2,'file-path','Имя файла из частей','вывод без лишних пробелов через sep',
    'Считайте имя файла и расширение без точки. Выведите имя.расширение в одной строке.',
    'Две непустые строки.','Части, разделённые одной точкой.',
    r'''name=input()
ext=input()
print(name,ext,sep=".")
---
name=input()
ext=input()
print(name+"."+ext)''',TEXTS,lambda a,b:a+'.'+b)
add(101,2,'labels-inline','Три пометки подряд','управление end в нескольких вызовах print',
    'Считайте три слова. Выведите «[первое][второе][третье]» в одной строке. В решении используйте три вызова print.',
    'Три непустые строки.','Одна строка без пробелов между скобками.',
    r'''a=input()
b=input()
c=input()
print("[",a,"]",sep="",end="")
print("[",b,"]",sep="",end="")
print("[",c,"]",sep="")
---
a=input()
b=input()
c=input()
print("["+a+"]",end="")
print("["+b+"]",end="")
print("["+c+"]")''',[(a,b,a) for a,b in TEXTS],lambda a,b,c:f'[{a}][{b}][{c}]')
add(101,2,'code-text','Две части кода','сохранение ведущих нулей при вводе текста',
    'Считайте две части кода. Не преобразовывайте их в числа. Выведите их через дефис, а на следующей строке — в обратном порядке через двоеточие.',
    'Две строки из цифр длиной 1..10.','Две строки.',
    r'''a=input()
b=input()
print(a,b,sep="-")
print(b,a,sep=":")
---
a=input()
b=input()
print(a+"-"+b)
print(b+":"+a)''',[('001','02'),('0','0'),('1','2'),('000000','7'),('9','010'),('12','034'),('987','1')],lambda a,b:f'{a}-{b}\n{b}:{a}')
add(101,2,'equation-product','Запись умножения','совместный вывод входных чисел и результата',
    'Считайте целые A и B. Выведите равенство «A * B = C», где C — произведение.',
    'Два целых числа от -1000 до 1000, каждое на своей строке.','Равенство с пробелами между частями.',
    r'''a=int(input())
b=int(input())
print(a,"*",b,"=",a*b)
---
a=int(input())
b=int(input())
c=a*b
print(a," * ",b," = ",c,sep="")''',NUMS,lambda a,b:f'{a} * {b} = {a*b}')
add(101,2,'two-separators','Два разных разделителя','независимую настройку sep в разных строках',
    'Считайте три слова. Выведите их через запятую без пробелов, затем те же слова через « / ».',
    'Три слова на отдельных строках.','Две строки.',
    r'''a=input()
b=input()
c=input()
print(a,b,c,sep=",")
print(a,b,c,sep=" / ")
---
a=input()
b=input()
c=input()
print(a+","+b+","+c)
print(a+" / "+b+" / "+c)''',[(a,b,a) for a,b in TEXTS],lambda a,b,c:f'{a},{b},{c}\n{a} / {b} / {c}')

# Variables: snapshots, types and state updates, without branching or loops.
add(102,0,'snapshot-label','Подпись до переименования','независимость уже вычисленной строки от изменения переменной',
    'Считайте старое имя и новое имя. Создайте label = "Имя: " + старое имя. Затем замените имя новым. Выведите label и новое имя.',
    'Две непустые строки.','Старая подпись, затем новое имя на новой строке.',
    r'''name=input()
new=input()
label="Имя: "+name
name=new
print(label)
print(name)
---
name=input()
replacement=input()
label="Имя: "+name
name=replacement
print(label,name,sep="\n")''',TEXTS,lambda a,b:f'Имя: {a}\n{b}')
add(102,0,'copies-two','Два сохранённых измерения','копирование числового значения до изменения',
    'Считайте x и прибавку d. Сохраните x в old. Увеличьте x на d. Выведите old, новый x и сумму old + x.',
    'Два целых числа от -1000 до 1000.','Три числа на отдельных строках.',
    r'''x=int(input())
d=int(input())
old=x
x+=d
print(old)
print(x)
print(old+x)
---
x=int(input())
d=int(input())
saved=x
x=x+d
total=saved+x
print(saved,x,total,sep="\n")''',NUMS,lambda x,d:f'{x}\n{x+d}\n{2*x+d}')
add(102,1,'decimal-join','Строка цифр и число','различие склеивания и арифметики после преобразования',
    'Считайте две строки цифр. Выведите сначала их склейку, затем сумму их числовых значений.',
    'Две строки цифр длиной 1..6, возможны ведущие нули.','Склейка и сумма на разных строках.',
    r'''a=input()
b=input()
print(a+b)
print(int(a)+int(b))
---
a=input()
b=input()
text=a+b
number=int(a)
number+=int(b)
print(text,number,sep="\n")''',[('001','02'),('0','0'),('9','1'),('12','34'),('000','7'),('99','99'),('123456','654321')],lambda a,b:f'{a+b}\n{int(a)+int(b)}')
add(102,1,'float-offset','Изменение дробного измерения','float при вводе и вещественный результат',
    'Считайте два числа x и d. Выведите x + d. Числа кратны 0.5, поэтому результат можно вывести обычным print.',
    'Два числа от -100 до 100 на разных строках.','Одно число с десятичной точкой, например 3.0.',
    r'''x=float(input())
d=float(input())
print(x+d)
---
value=float(input())
change=float(input())
value+=change
print(value)''',[(1.5,2.5),(0.0,0.0),(-1.5,1.0),(100.0,-100.0),(0.5,0.0),(-2.0,-3.5),(1.0,1.0)],lambda x,d:str(x+d))
add(102,1,'numeric-title','Номер в текстовой подписи','преобразование вычисленного числа в строку',
    'Считайте название и целый номер n. Создайте строку «Название #n» с помощью str и выведите её.',
    'Название, затем целое число от 0 до 10000.','Одна подпись.',
    r'''name=input()
n=int(input())
label=name+" #"+str(n)
print(label)
---
name=input()
n=int(input())
suffix=str(n)
name+=" #"
name+=suffix
print(name)''',[(x,i*11) for i,(x,_) in enumerate(TEXTS)],lambda name,n:f'{name} #{n}')
add(102,2,'resource-steps','Ресурс после трёх событий','последовательное обновление одной переменной',
    'Считайте запас s, расход a и пополнение b. Сначала вычтите a, затем прибавьте b, затем снова вычтите a. После каждого события выведите запас.',
    'Три целых числа от 0 до 1000; промежуточный запас может быть отрицательным.','Три промежуточных значения.',
    r'''s=int(input())
a=int(input())
b=int(input())
s-=a
print(s)
s+=b
print(s)
s-=a
print(s)
---
s=int(input())
a=int(input())
b=int(input())
s=s-a
first=s
s=s+b
second=s
s=s-a
print(first,second,s,sep="\n")''',[(10,3,5),(0,0,0),(0,4,1),(2,2,2),(1000,0,1000),(1,1000,0),(8,3,0)],lambda s,a,b:f'{s-a}\n{s-a+b}\n{s-2*a+b}')
add(102,2,'double-new','Удвоить текущее значение','зависимость следующего действия от уже изменённого значения',
    'Считайте a и b. Прибавьте b к a, затем удвойте a, затем вычтите b. Выведите итоговое a.',
    'Два целых числа от -1000 до 1000.','Одно целое число.',
    r'''a=int(input())
b=int(input())
a+=b
a*=2
a-=b
print(a)
---
a=int(input())
b=int(input())
a=a+b
a=a+a
a=a-b
print(a)''',NUMS,lambda a,b:2*a+b)
add(102,2,'repeat-current','Удвоить собранную подпись','обновление строки с использованием её текущего значения',
    'Считайте две строки a и b. Добавьте к a дефис и b, затем добавьте к получившейся строке двоеточие и её копию. Выведите результат.',
    'Две непустые строки.','Одна строка.',
    r'''a=input()
b=input()
a+="-"+b
a+=":"+a
print(a)
---
a=input()
b=input()
a=a+"-"+b
saved=a
a=a+":"+saved
print(a)''',TEXTS,lambda a,b:f'{a}-{b}:{a}-{b}')
add(102,3,'swap-compute','Обмен и последующее вычисление','временную переменную и использование новых значений',
    'Считайте a и b, поменяйте их местами через временную переменную. Выведите новые a, b и значение a - 2*b. Множественное присваивание не нужно.',
    'Два целых числа от -1000 до 1000.','Три числа на разных строках.',
    r'''a=int(input())
b=int(input())
temp=a
a=b
b=temp
print(a)
print(b)
print(a-2*b)
---
first=int(input())
second=int(input())
saved=second
second=first
first=saved
result=first-2*second
print(first,second,result,sep="\n")''',NUMS,lambda a,b:f'{b}\n{a}\n{b-2*a}')
add(102,3,'left-cycle','Передать значения влево','сохранение исходного значения при цепочке присваиваний',
    'Считайте a, b, c. Сделайте a равным старому b, b — старому c, c — старому a. Используйте временную переменную. Выведите новые a, b, c.',
    'Три строки.','Три строки в новом порядке.',
    r'''a=input()
b=input()
c=input()
saved=a
a=b
b=c
c=saved
print(a,b,c,sep="\n")
---
a=input()
b=input()
c=input()
old_a=a
old_b=b
a=old_b
b=c
c=old_a
print(a)
print(b)
print(c)''',[(a,b,str(i)) for i,(a,b) in enumerate(TEXTS)],lambda a,b,c:f'{b}\n{c}\n{a}')
add(102,3,'parallel-change','Два новых значения из старых','расчёт двух результатов до перезаписи исходных данных',
    'Считайте a и b. Новое a должно равняться старому a + b, а новое b — старому a - b. Сначала сохраните нужные исходные значения.',
    'Два целых числа от -1000 до 1000.','Новые a и b на разных строках.',
    r'''a=int(input())
b=int(input())
old_a=a
old_b=b
a=old_a+old_b
b=old_a-old_b
print(a,b,sep="\n")
---
a=int(input())
b=int(input())
total=a+b
difference=a-b
a=total
b=difference
print(a)
print(b)''',NUMS,lambda a,b:f'{a+b}\n{a-b}')
add(102,2,'restore-two','Вернуть исходный счёт','сохранение состояния перед несколькими изменениями',
    'Считайте счёт x и прибавку d. Сохраните исходный счёт, прибавьте d и умножьте результат на 3. Выведите изменённый счёт, затем восстановите и выведите исходный.',
    'Два целых числа от -1000 до 1000.','Изменённый и восстановленный счёт.',
    r'''x=int(input())
d=int(input())
backup=x
x+=d
x*=3
print(x)
x=backup
print(x)
---
x=int(input())
d=int(input())
old=x
x=(x+d)*3
changed=x
x=old
print(changed,x,sep="\n")''',NUMS,lambda x,d:f'{(x+d)*3}\n{x}')

# Conditions: every reference uses if, including all equality boundaries.
add(103,0,'temperature-target','Достигнута ли температура','сравнение с порогом и включение равенства',
    'Считайте текущую и нужную температуры. Если текущая не ниже нужной, выведите READY, иначе HEAT.',
    'Два целых числа от -1000 до 1000.','READY или HEAT.',
    r'''current=int(input())
target=int(input())
if current>=target:
    print("READY")
else:
    print("HEAT")
---
t=int(input())
goal=int(input())
answer="HEAT"
if t>=goal:
    answer="READY"
print(answer)''',NUMS+[(5,5)],lambda a,b:'READY' if a>=b else 'HEAT')
add(103,0,'compare-purchases','Какая покупка дешевле','сравнение вычисленных стоимостей и отдельную ничью',
    'Считайте цену и количество первой покупки, затем цену и количество второй. Выведите FIRST, SECOND или SAME: какая полная стоимость меньше.',
    'Четыре целых числа от 0 до 1000 на разных строках.','Одна метка.',
    r'''p=int(input())
n=int(input())
q=int(input())
m=int(input())
if p*n<q*m:
    print("FIRST")
elif p*n>q*m:
    print("SECOND")
else:
    print("SAME")
---
p=int(input())
n=int(input())
q=int(input())
m=int(input())
a=p*n
b=q*m
result="SAME"
if a<b:
    result="FIRST"
if a>b:
    result="SECOND"
print(result)''',[(2,3,3,2),(2,1,5,1),(5,2,1,9),(0,1,0,4),(1,0,2,1),(1000,1000,999,1000),(3,4,5,6)],lambda p,n,q,m:'SAME' if p*n==q*m else 'FIRST' if p*n<q*m else 'SECOND')
add(103,1,'battery','Уровень заряда','непересекающиеся диапазоны в цепочке elif',
    'Заряд 0 означает EMPTY, от 1 до 19 — LOW, от 20 до 79 — NORMAL, от 80 до 100 — HIGH.',
    'Целый заряд от 0 до 100.','Одна метка.',
    r'''n=int(input())
if n==0:
    print("EMPTY")
elif n<20:
    print("LOW")
elif n<80:
    print("NORMAL")
else:
    print("HIGH")
---
n=int(input())
if n>=80:
    answer="HIGH"
elif n>=20:
    answer="NORMAL"
elif n>0:
    answer="LOW"
else:
    answer="EMPTY"
print(answer)''',[(x,) for x in [0,1,19,20,79,80,99,100]],lambda n:'EMPTY' if n==0 else 'LOW' if n<=19 else 'NORMAL' if n<=79 else 'HIGH')
add(103,1,'equal-count','Сколько различных из трёх','проверку всех равенств без коллекций',
    'Считайте три целых числа. Выведите, сколько среди них различных значений: 1, 2 или 3. Решите условиями без списков и множеств.',
    'Три целых числа от -100 до 100.','1, 2 или 3.',
    r'''a=int(input())
b=int(input())
c=int(input())
if a==b and b==c:
    print(1)
elif a==b or a==c or b==c:
    print(2)
else:
    print(3)
---
a=int(input())
b=int(input())
c=int(input())
if a!=b and a!=c and b!=c:
    answer=3
elif a==b and a==c:
    answer=1
else:
    answer=2
print(answer)''',[(1,1,1),(1,1,2),(1,2,1),(2,1,1),(1,2,3),(0,0,-1),(-3,-3,-3),(100,0,-100)],lambda a,b,c:len(set([a,b,c])))
add(103,2,'overlapping-segments','Пересекаются ли отрезки','объединение двух необходимых сравнений',
    'Даны закрытые отрезки [a,b] и [c,d]. Выведите YES, если они имеют хотя бы одну общую точку, иначе NO. Касание концами считается пересечением.',
    'a,b,c,d — целые от -100 до 100 на отдельных строках; a<=b, c<=d.','YES или NO.',
    r'''a=int(input())
b=int(input())
c=int(input())
d=int(input())
if a<=d and c<=b:
    print("YES")
else:
    print("NO")
---
a=int(input())
b=int(input())
c=int(input())
d=int(input())
if b<c or d<a:
    print("NO")
else:
    print("YES")''',[(-2,3,3,8),(0,1,2,3),(2,3,0,1),(1,1,1,1),(-5,5,-1,1),(-9,-3,-2,0),(0,0,-1,1),(-100,100,-100,100)],lambda a,b,c,d:'YES' if max(a,c)<=min(b,d) else 'NO')
add(103,2,'one-divisor','Делится ровно на одно','исключающее или для двух признаков',
    'Выведите YES, если n делится ровно на одно из чисел 3 и 5. Если делится на оба или ни на одно — NO.',
    'Целое n от -1000 до 1000.','YES или NO.',
    r'''n=int(input())
if (n%3==0 and n%5!=0) or (n%3!=0 and n%5==0):
    print("YES")
else:
    print("NO")
---
n=int(input())
count=0
if n%3==0:
    count+=1
if n%5==0:
    count+=1
if count==1:
    print("YES")
else:
    print("NO")''',[(x,) for x in [0,1,3,5,15,-3,-5,-15,30,7]],lambda n:'YES' if (n%3==0)!=(n%5==0) else 'NO')
add(103,2,'leap','Високосный год по правилу','приоритет and и or с исключением для столетий',
    'Год високосный, если делится на 400 либо делится на 4, но не делится на 100. Выведите YES или NO.',
    'Целый год от 1 до 9999.','YES или NO.',
    r'''year=int(input())
if year%400==0 or (year%4==0 and year%100!=0):
    print("YES")
else:
    print("NO")
---
year=int(input())
if year%400==0:
    answer="YES"
elif year%100==0:
    answer="NO"
elif year%4==0:
    answer="YES"
else:
    answer="NO"
print(answer)''',[(x,) for x in [1,4,100,400,1900,2000,2024,2025,2100,2400]],lambda y:'YES' if __import__('calendar').isleap(y) else 'NO')
add(103,2,'board-colour','Одинаковый цвет клеток','проверку чётности вычисленных координат',
    'Клетки с чётной суммой координат имеют один цвет, с нечётной — другой. Сравните цвет клеток (x1,y1) и (x2,y2).',
    'Четыре целых координаты от 1 до 8, каждая на новой строке.','SAME или DIFFERENT.',
    r'''x=int(input())
y=int(input())
a=int(input())
b=int(input())
if (x+y)%2==(a+b)%2:
    print("SAME")
else:
    print("DIFFERENT")
---
x=int(input())
y=int(input())
a=int(input())
b=int(input())
if (x+y+a+b)%2==0:
    print("SAME")
else:
    print("DIFFERENT")''',[(1,1,8,8),(1,1,1,2),(2,3,4,5),(8,1,1,8),(3,3,3,3),(8,8,8,7),(1,2,2,1)],lambda x,y,a,b:'SAME' if (abs(x-a)+abs(y-b))%2==0 else 'DIFFERENT')
add(103,3,'exact-login','Проверка двух полей','одновременное точное сравнение строк',
    'Доступ разрешён только при логине student и пароле python. Регистр важен. Выведите OPEN или DENIED.',
    'Логин и пароль на разных строках; строки могут быть пустыми.','OPEN или DENIED.',
    r'''login=input()
password=input()
if login=="student" and password=="python":
    print("OPEN")
else:
    print("DENIED")
---
login=input()
password=input()
answer="DENIED"
if login=="student":
    if password=="python":
        answer="OPEN"
print(answer)''',[('student','python'),('Student','python'),('student','Python'),('',''),('student',''),('teacher','python'),('python','student')],lambda a,b:'OPEN' if [a,b]==['student','python'] else 'DENIED')
add(103,3,'operation-name','Действие по текстовой команде','выбор арифметического действия по строке',
    'Считайте команду add, sub или mul, затем a и b. Выполните соответствующее сложение, вычитание или умножение. Для другой команды выведите ERROR.',
    'Команда, затем два целых числа от -100 до 100.','Результат или ERROR.',
    r'''command=input()
a=int(input())
b=int(input())
if command=="add":
    print(a+b)
elif command=="sub":
    print(a-b)
elif command=="mul":
    print(a*b)
else:
    print("ERROR")
---
command=input()
a=int(input())
b=int(input())
answer="ERROR"
if command=="add":
    answer=a+b
if command=="sub":
    answer=a-b
if command=="mul":
    answer=a*b
print(answer)''',[('add',2,3),('sub',2,3),('mul',-2,3),('ADD',2,3),('',0,0),('add',0,0),('mul',0,7),('sub',-1,-2)],lambda c,a,b:{'add':a+b,'sub':a-b,'mul':a*b}.get(c,'ERROR'))
add(103,4,'safe-quotient','Деление только при ненулевом знаменателе','проверку опасного действия до его выполнения',
    'Считайте a и b. Если b равно 0, выведите ZERO. Иначе выведите целую часть a // b.',
    'Два целых числа от -1000 до 1000.','Целое число или ZERO.',
    r'''a=int(input())
b=int(input())
if b==0:
    print("ZERO")
else:
    print(a//b)
---
a=int(input())
b=int(input())
if b!=0:
    answer=a//b
else:
    answer="ZERO"
print(answer)''',[(5,0),(0,0),(0,3),(7,2),(-7,2),(7,-2),(-7,-2),(100,1)],lambda a,b:'ZERO' if not b else math.floor(a/b))
add(103,4,'inside-valid','Проверить границы, затем точку','вложенные проверки корректности данных',
    'Считайте left, right и x. Если left больше right, выведите ERROR. Иначе выведите IN, когда x лежит внутри закрытого отрезка, и OUT в остальных случаях.',
    'Три целых числа от -100 до 100.','ERROR, IN или OUT.',
    r'''left=int(input())
right=int(input())
x=int(input())
if left>right:
    print("ERROR")
elif left<=x<=right:
    print("IN")
else:
    print("OUT")
---
a=int(input())
b=int(input())
x=int(input())
if a<=b:
    if x<a or x>b:
        print("OUT")
    else:
        print("IN")
else:
    print("ERROR")''',[(1,3,1),(1,3,3),(1,3,0),(1,3,4),(2,2,2),(3,1,2),(-5,0,-2),(0,0,1)],lambda a,b,x:'ERROR' if a>b else 'IN' if x in range(a,b+1) else 'OUT')

# Calculations: arithmetic operators, units, rounding and modular coordinates.
add(104,1,'seconds-parts','Секунды в часы, минуты и секунды','последовательное выделение единиц через // и %',
    'Считайте длительность в секундах. Выведите полные часы, оставшиеся минуты и секунды. Часы могут быть больше 23.',
    'Целое n от 0 до 1000000.','Три целых числа через пробел.',
    r'''n=int(input())
print(n//3600,n%3600//60,n%60)
---
n=int(input())
hours=n//3600
n-=hours*3600
minutes=n//60
n-=minutes*60
print(hours,minutes,n)''',[(x,) for x in [0,1,59,60,61,3599,3600,3661,86400,1000000]],lambda n:joined([n//3600,(n//60)%60,n%60]))
add(104,1,'seat-row','Ряд и место по номеру билета','переход от нумерации с единицы к делению с остатком',
    'В каждом ряду k мест. Билеты нумеруются подряд с 1. Найдите ряд и место для билета n; оба номера начинаются с 1.',
    'n от 1 до 1000000, затем k от 1 до 1000.','Ряд и место через пробел.',
    r'''n=int(input())
k=int(input())
print((n-1)//k+1,(n-1)%k+1)
---
n=int(input())
k=int(input())
zero=n-1
row=zero//k
seat=zero-row*k
print(row+1,seat+1)''',[(1,1),(1,10),(10,10),(11,10),(20,10),(21,10),(1000000,999),(1000,1)],lambda n,k:joined([math.ceil(n/k),n-(math.ceil(n/k)-1)*k]))
add(104,1,'middle-digits','Средние цифры четырёхзначного числа','выделение нужных разрядов арифметикой',
    'У четырёхзначного числа найдите сумму двух средних цифр. Не преобразовывайте число в строку.',
    'Целое от 1000 до 9999.','Сумма сотен и десятков.',
    r'''n=int(input())
print(n//100%10+n//10%10)
---
n=int(input())
middle=n%1000//10
print(middle//10+middle%10)''',[(x,) for x in [1234,1000,9999,9080,1090,8001,4567,7777]],lambda n:sum(map(int,str(n)[1:3])))
add(104,1,'rotate-four','Последнюю цифру в начало','сборку нового числа из остатка и частного',
    'Перенесите последнюю цифру четырёхзначного числа в начало. Выведите полученное число; ведущие нули не печатаются.',
    'Целое от 1000 до 9999.','Одно целое число.',
    r'''n=int(input())
print(n%10*1000+n//10)
---
n=int(input())
last=n%10
rest=(n-last)//10
result=last*1000+rest
print(result)''',[(x,) for x in [1234,1200,1000,9999,1010,8001,4567,9009]],lambda n:int(str(n)[-1]+str(n)[:-1]))
add(104,1,'complete-pages','Полные страницы и остаток','различие полного количества групп и незаполненного остатка',
    'На странице помещается k записей. Для n записей выведите количество полностью заполненных страниц и число записей на последней неполной странице. Если неполной страницы нет, второе число — 0.',
    'n от 0 до 1000000, затем k от 1 до 1000.','Два целых числа.',
    r'''n=int(input())
k=int(input())
print(n//k,n%k)
---
n=int(input())
k=int(input())
full=n//k
rest=n-full*k
print(full,rest)''',[(0,10),(9,10),(10,10),(11,10),(20,10),(1000000,999),(5,1),(1,1000)],lambda n,k:joined(divmod(n,k)))
add(104,2,'average-three','Среднее с двумя знаками','вещественное деление и фиксированное форматирование',
    'Считайте три целых результата и выведите их среднее арифметическое ровно с двумя цифрами после точки.',
    'Три целых числа от -1000 до 1000 на отдельных строках.','Одно число, например 2.00.',
    r'''a=int(input())
b=int(input())
c=int(input())
average=(a+b+c)/3
print(f"{average:.2f}")
---
a=int(input())
b=int(input())
c=int(input())
total=a+b
total+=c
answer=total/3
print(f"{answer:.2f}")''',[(1,2,3),(0,0,0),(1,1,2),(-1,-2,-4),(1000,1000,999),(-1000,0,1000),(0,1,0)],lambda a,b,c:f'{(a+b+c)/3:.2f}')
add(104,2,'round-to-ten','Округлить до десятков по Python','аргумент точности round и половинные значения',
    'Округлите целое n до десятков функцией round(n, -1). При равном расстоянии Python выбирает десяток с чётной цифрой десятков: 25 -> 20, 35 -> 40.',
    'Целое от -1000 до 1000.','Округлённое целое число.',
    r'''n=int(input())
print(round(n,-1))
---
n=int(input())
rounded=round(n/10)
print(rounded*10)''',[(x,) for x in [25,35,0,14,15,16,-25,-35,999,-999]],lambda n:round(n,-1))
add(104,3,'sale-rubles','Цена после скидки в копейках','целые вычисления процентов без погрешности float',
    'Цена p указана в копейках. После скидки d процентов магазин отбрасывает дробную копейку вниз. Выведите цену после скидки.',
    'p от 0 до 1000000, затем целый процент d от 0 до 100.','Цена в копейках.',
    r'''p=int(input())
d=int(input())
print(p*(100-d)//100)
---
p=int(input())
d=int(input())
remaining=100-d
cost=p*remaining
cost//=100
print(cost)''',[(101,50),(1,1),(0,50),(100,0),(100,100),(999,33),(1000000,99),(199,50)],lambda p,d:math.floor(p*(100-d)/100))
add(104,4,'temperature-distance','Расстояние до границ','модуль и выбор меньшего расстояния',
    'Даны две границы a<=b и число x, которое может лежать где угодно. Найдите расстояние от x до ближайшей границы.',
    'Три целых числа от -10000 до 10000.','Неотрицательное целое число.',
    r'''a=int(input())
b=int(input())
x=int(input())
print(min(abs(x-a),abs(x-b)))
---
a=int(input())
b=int(input())
x=int(input())
left=abs(a-x)
right=abs(b-x)
if left<right:
    print(left)
else:
    print(right)''',[(0,10,5),(0,10,-3),(0,10,12),(2,2,2),(-10,-2,-7),(-10000,10000,0),(1,3,1),(1,3,3)],lambda a,b,x:sorted([abs(a-x),abs(b-x)])[0])
add(104,4,'overnight','Минуты до следующего времени','циклическую разность времени через остаток',
    'Сейчас h1:m1. Найдите число минут до ближайшего момента h2:m2, включая текущий: если время совпадает, ответ 0. При необходимости наступит следующий день.',
    'h1,m1,h2,m2 на отдельных строках; часы 0..23, минуты 0..59.','Количество минут от 0 до 1439.',
    r'''h1=int(input())
m1=int(input())
h2=int(input())
m2=int(input())
print((h2*60+m2-h1*60-m1)%1440)
---
h1=int(input())
m1=int(input())
h2=int(input())
m2=int(input())
start=h1*60+m1
end=h2*60+m2
if end<start:
    end+=1440
print(end-start)''',[(23,59,0,0),(0,0,0,0),(10,0,11,0),(11,0,10,0),(0,0,23,59),(12,30,12,29),(1,59,2,0),(23,0,1,30)],lambda h,m,a,b:(60*(a-h)+b-m+1440)%1440)
add(104,4,'ring-index','Переход по кругу с отрицательным шагом','остаток при циклической нумерации с нуля',
    'На круге n позиций с номерами от 0 до n-1. Из позиции start сделайте shift шагов; отрицательное число означает движение назад. Выведите итоговый номер.',
    'n от 1 до 1000, start от 0 до n-1, shift от -100000 до 100000 на разных строках.','Номер позиции.',
    r'''n=int(input())
start=int(input())
shift=int(input())
print((start+shift)%n)
---
n=int(input())
position=int(input())
shift=int(input())
position+=shift
position-=position//n*n
print(position)''',[(5,0,-1),(5,4,1),(1,0,-99),(10,3,0),(7,2,-100000),(7,2,100000),(3,1,-1),(5,2,15)],lambda n,s,d:(s+d)-math.floor((s+d)/n)*n)
add(104,0,'cube-expressions','Куб суммы и сумма кубов','скобки и степень составного выражения',
    'Считайте a и b. Выведите (a+b)**3 и a**3+b**3 на разных строках.',
    'Два целых числа от -1000 до 1000.','Два целых результата.',
    r'''a=int(input())
b=int(input())
print((a+b)**3)
print(a**3+b**3)
---
a=int(input())
b=int(input())
s=a+b
first=s*s*s
second=a*a*a+b*b*b
print(first,second,sep="\n")''',NUMS,lambda a,b:f'{pow(a+b,3)}\n{pow(a,3)+pow(b,3)}')

# for: bounded iteration and streaming, never lists or while.
SEQS=[[],[0],[1],[-1],[1,0,2],[1,2,3],[3,2,1],[2,2,2],[-2,0,2,-1,3],[5,-2,5,0],[-5,-4,-3]]
SEQS += [[RNG.randint(-9,9) for _ in range(RNG.randint(0,18))] for _ in range(10)]
def stream(args):
    return str(len(args[0]))+'\n'+''.join(str(x)+'\n' for x in args[0])

add(105,0,'every-step','Ряд с заданным шагом до границы','правую границу range и положительный шаг',
    'Выведите числа a, a+k, a+2*k и так далее, пока число не превышает b. Используйте for.',
    'a,b от -100 до 100, a<=b; k от 1 до 20. Каждое число на новой строке.','Числа через пробел.',
    r'''a=int(input())
b=int(input())
k=int(input())
for x in range(a,b+1,k):
    print(x,end=" ")
print()
---
a=int(input())
b=int(input())
k=int(input())
count=(b-a)//k+1
answer=""
for i in range(count):
    answer+=str(a+i*k)+" "
print(answer)''',[(0,0,1),(1,5,2),(1,6,2),(-5,5,3),(10,10,20),(-3,-1,1),(0,100,20)],lambda a,b,k:joined(range(a,b+1,k)))
add(105,1,'products-neighbours','Сумма произведений соседних чисел','накопитель по вычисляемым членам последовательности',
    'Найдите 1*2 + 2*3 + ... + n*(n+1) циклом for. Для n=0 ответ 0.',
    'Целое n от 0 до 1000.','Одна целая сумма.',
    r'''n=int(input())
total=0
for i in range(1,n+1):
    total+=i*(i+1)
print(total)
---
n=int(input())
result=0
for i in range(n):
    a=i+1
    result=result+a*(a+1)
print(result)''',[(x,) for x in [0,1,2,3,10,99,1000]],lambda n:n*(n+1)*(n+2)//3)
add(105,1,'odd-positions-sum','Сумма измерений на нечётных местах','номер шага отдельно от значения элемента',
    'Считайте n измерений. Сложите только измерения с номерами 1,3,5,... . Используйте for, хранить весь список не нужно.',
    'n от 0 до 100, затем n целых чисел от -100 до 100, каждое на новой строке.','Сумма или 0 при отсутствии измерений.',
    r'''n=int(input())
total=0
for i in range(1,n+1):
    x=int(input())
    if i%2==1:
        total+=x
print(total)
---
n=int(input())
answer=0
for i in range(n):
    value=int(input())
    if i%2==0:
        answer=answer+value
print(answer)''',[(s,) for s in SEQS],lambda s:sum(s[::2]),stream)
add(105,1,'positive-product','Произведение положительных измерений','условный накопитель с начальным произведением 1',
    'Перемножьте все строго положительные измерения. Неположительные пропускайте. Если положительных нет, выведите 1. Используйте for.',
    'n от 0 до 20, затем n целых чисел от -9 до 9 на отдельных строках.','Одно целое число.',
    r'''n=int(input())
product=1
for i in range(n):
    x=int(input())
    if x>0:
        product*=x
print(product)
---
n=int(input())
p=1
for number in range(1,n+1):
    value=int(input())
    if value<=0:
        continue
    p=p*value
print(p)''',[(s,) for s in SEQS],lambda s:math.prod(x for x in s if x>0),stream)
add(105,2,'before-negative','Сумма до первого отрицательного','флаг остановки накопления при продолжении чтения',
    'Из n чисел сложите только те, что стоят до первого отрицательного. Само отрицательное и всё после него не учитываются. Все n чисел прочитайте циклом for.',
    'n от 0 до 100, затем n целых чисел от -100 до 100 на отдельных строках.','Сумма; если первое число отрицательное или n=0, ответ 0.',
    r'''n=int(input())
total=0
stopped=False
for i in range(n):
    x=int(input())
    if x<0:
        stopped=True
    if not stopped:
        total+=x
print(total)
---
n=int(input())
answer=0
active=True
for i in range(n):
    value=int(input())
    if active:
        if value<0:
            active=False
        else:
            answer+=value
print(answer)''',[(s,) for s in SEQS],lambda s:sum(s[:next((i for i,x in enumerate(s) if x<0),len(s))]),stream)
add(105,3,'first-maximum','Первое место максимума','строгое обновление экстремума и сохранение первой позиции',
    'Найдите номер первого максимального измерения. Номера начинаются с 1. Используйте for без списка.',
    'n от 1 до 100, затем n целых измерений от -100 до 100 на отдельных строках.','Номер первого максимума.',
    r'''n=int(input())
best=int(input())
position=1
for i in range(2,n+1):
    x=int(input())
    if x>best:
        best=x
        position=i
print(position)
---
n=int(input())
answer=0
best=0
for i in range(n):
    value=int(input())
    if i==0 or value>best:
        best=value
        answer=i+1
print(answer)''',[(s,) for s in SEQS if s],lambda s:s.index(max(s))+1,stream)
add(105,3,'nondecreasing-run','Самый длинный неубывающий участок','текущую длину серии и сброс при нарушении условия',
    'Найдите максимальную длину подряд идущего участка, на котором каждое число не меньше предыдущего. Одинаковые числа продолжают участок. Используйте for.',
    'n от 0 до 100, затем n целых чисел от -100 до 100 на отдельных строках.','Длина; при n=0 ответ 0.',
    r'''n=int(input())
best=0
length=0
previous=0
for i in range(n):
    x=int(input())
    if i==0 or x<previous:
        length=1
    else:
        length+=1
    best=max(best,length)
    previous=x
print(best)
---
n=int(input())
answer=0
start=0
previous=0
for i in range(n):
    current=int(input())
    if i>0 and current<previous:
        start=i
    answer=max(answer,i-start+1)
    previous=current
print(answer)''',[(s,) for s in SEQS],lambda s:max([j-i for i in range(len(s)) for j in range(i+1,len(s)+1) if all(a<=b for a,b in zip(s[i:j],s[i+1:j]))],default=0),stream)
add(105,2,'sign-changes','Соседние числа разных знаков','предыдущее значение и условный счётчик',
    'Посчитайте пары соседних измерений, в которых одно строго положительное, а другое строго отрицательное. Ноль не подходит ни к одной такой паре. Используйте for.',
    'n от 0 до 100, затем n целых чисел от -100 до 100 на отдельных строках.','Число подходящих соседних пар.',
    r'''n=int(input())
previous=0
count=0
for i in range(n):
    x=int(input())
    if i>0 and x*previous<0:
        count+=1
    previous=x
print(count)
---
n=int(input())
previous=0
answer=0
for i in range(n):
    current=int(input())
    if (previous<0 and current>0) or (previous>0 and current<0):
        answer+=1
    previous=current
print(answer)''',[(s,) for s in SEQS],lambda s:sum((a<0<b) or (b<0<a) for a,b in zip(s,s[1:])),stream)
add(105,4,'odd-divisors','Сумма нечётных делителей','перебор кандидатов с двумя арифметическими проверками',
    'Найдите сумму всех нечётных положительных делителей числа n. Само n тоже учитывается, если оно нечётное. Используйте for.',
    'Целое n от 1 до 10000.','Одно целое число.',
    r'''n=int(input())
total=0
for d in range(1,n+1):
    if n%d==0 and d%2==1:
        total+=d
print(total)
---
n=int(input())
answer=0
for d in range(1,n+1,2):
    if n%d==0:
        answer+=d
print(answer)''',[(x,) for x in [1,2,3,8,9,15,36,97,10000]],lambda n:sum(d for d in range(1,n+1,2) if n%d==0))
add(105,5,'multiplication-grid','Таблица произведений','два независимых диапазона во вложенных for',
    'Выведите n строк и m столбцов. В строке i и столбце j должно стоять i*j; номера начинаются с 1. Используйте вложенные for.',
    'n и m от 1 до 8 на разных строках.','Таблица чисел; элементы строки разделяйте пробелами.',
    r'''n=int(input())
m=int(input())
for i in range(1,n+1):
    for j in range(1,m+1):
        print(i*j,end=" ")
    print()
---
n=int(input())
m=int(input())
for i in range(n):
    row=""
    for j in range(m):
        row+=str((i+1)*(j+1))+" "
    print(row)''',[(1,1),(1,5),(5,1),(2,3),(3,2),(8,8),(4,6)],lambda n,m:'\n'.join(joined(i*j for j in range(1,m+1)) for i in range(1,n+1)))
add(105,5,'grid-diagonal','Диагональ в квадрате','условие по двум координатам внутри вложенного цикла',
    'Выведите квадрат n на n: на главной диагонали стоят #, в остальных местах точки. Символы в строке идут без пробелов. Используйте вложенные for.',
    'Целое n от 1 до 20.','n строк по n символов.',
    r'''n=int(input())
for i in range(n):
    for j in range(n):
        if i==j:
            print("#",end="")
        else:
            print(".",end="")
    print()
---
n=int(input())
for row in range(n):
    line=""
    for column in range(n):
        if row==column:
            line+="#"
        else:
            line+="."
    print(line)''',[(x,) for x in [1,2,3,4,7,20]],lambda n:'\n'.join('.'*i+'#'+'.'*(n-i-1) for i in range(n)))
add(105,1,'repeat-double-minus','Повторить изменение n раз','обновление накопителя фиксированное число раз',
    'Начните со значения x. Повторите n раз действие «умножить текущее значение на 2 и вычесть 1». Выведите результат. Используйте for.',
    'x от -10 до 10, затем n от 0 до 20.','Одно целое число.',
    r'''x=int(input())
n=int(input())
for i in range(n):
    x=x*2-1
print(x)
---
x=int(input())
n=int(input())
for step in range(1,n+1):
    x*=2
    x-=1
print(x)''',[(0,0),(1,20),(2,1),(2,3),(-1,2),(10,20),(0,5),(7,0)],lambda x,n:2**n*(x-1)+1)

# Strings: indexing/methods and character scans, no list required.
STRINGS=['','a','ab','abba','Python','a b c','  two  words ','0001200','Ёжик','abababa']
add(106,0,'remove-middle','Убрать середину строки','два среза вокруг одного или двух средних символов',
    'Если длина строки нечётная, удалите средний символ; если чётная — два средних. Для пустой строки оставьте пустую строку.',
    'Строка длиной 0..1000.','Результат в квадратных скобках.',
    r'''s=input()
n=len(s)
if n%2==1:
    result=s[:n//2]+s[n//2+1:]
elif n>0:
    result=s[:n//2-1]+s[n//2+1:]
else:
    result=""
print("["+result+"]")
---
s=input()
n=len(s)
left=(n-1)//2
right=n//2+1
result=""
for i in range(n):
    if i<left or i>=right:
        result+=s[i]
print("["+result+"]")''',[(s,) for s in STRINGS],lambda s:'['+''.join(c for i,c in enumerate(s) if i not in ({len(s)//2} if len(s)%2 else {len(s)//2-1,len(s)//2}))+']')
add(106,0,'reverse-prefix','Перевернуть только начало','сочетание среза и обратного порядка ограниченного фрагмента',
    'Переверните первые k символов строки, остальные сохраните. При k=0 строка не меняется.',
    'Строка длиной 0..1000, затем k от 0 до её длины.','Результат в квадратных скобках.',
    r'''s=input()
k=int(input())
print("["+s[:k][::-1]+s[k:]+"]")
---
s=input()
k=int(input())
result=""
for i in range(k-1,-1,-1):
    result+=s[i]
result+=s[k:]
print("["+result+"]")''',[(s,k) for s in STRINGS for k in sorted(set([0,len(s)//2,len(s)]))],lambda s,k:'['+''.join(reversed(s[:k]))+s[k:]+']')
add(106,0,'every-third-char','Каждый третий символ с конца','отрицательный шаг среза и его начальную позицию',
    'Возьмите последний символ строки, затем четвёртый с конца, затем седьмой с конца и так далее.',
    'Строка длиной 0..1000.','Выбранные символы в квадратных скобках.',
    r'''s=input()
print("["+s[::-3]+"]")
---
s=input()
result=""
for i in range(len(s)-1,-1,-3):
    result+=s[i]
print("["+result+"]")''',[(s,) for s in STRINGS],lambda s:'['+''.join(c for i,c in enumerate(reversed(s)) if i%3==0)+']')
add(106,1,'clean-tags','Убрать знаки только по краям','strip как удаление набора символов с двух концов',
    'Удалите с обоих краёв строки все знаки ! и ?. Знаки внутри строки сохраняйте. Пробелы и другие символы не удаляйте.',
    'Строка длиной 0..1000.','Результат в квадратных скобках.',
    r'''s=input()
print("["+s.strip("!?")+"]")
---
s=input()
left=0
right=len(s)
for i in range(len(s)):
    if s[i] not in "!?":
        break
    left+=1
for i in range(len(s)-1,left-1,-1):
    if s[i] not in "!?":
        break
    right-=1
print("["+s[left:right]+"]")''',[(s,) for s in ['!?word?!','!!!','', 'a!b?c',' !x! ','?ab!cd?','!?x','x?!']],lambda s:'['+re.sub(r'^[!?]+|[!?]+$','',s)+']')
add(106,1,'case-insensitive-end','Расширение TXT без учёта регистра','нормализацию регистра и проверку суффикса',
    'Выведите YES, если имя файла оканчивается на .txt без учёта регистра, иначе NO. Одного слова txt без точки недостаточно.',
    'Строка длиной 0..1000.','YES или NO.',
    r'''s=input()
if s.lower().endswith(".txt"):
    print("YES")
else:
    print("NO")
---
s=input().lower()
if s[-4:]==".txt":
    print("YES")
else:
    print("NO")''',[(s,) for s in ['a.txt','a.TXT','.txt','txt','a.txt.zip','','a.txt ','my file.TxT','file.py']],lambda s:'YES' if re.search(r'\.txt\Z',s,re.I) else 'NO')
add(106,2,'signed-code','Знак и десятичные цифры','отделение необязательного знака от проверки символов',
    'Корректная запись целого числа состоит из необязательного + или - в начале и хотя бы одной цифры 0..9. Ведущие нули разрешены. Проверьте строку.',
    'Строка длиной 0..1000, возможны пробелы и буквы.','YES или NO.',
    r'''s=input()
if s[:1] in "+-" and s!="":
    s=s[1:]
valid=len(s)>0
for ch in s:
    if ch<"0" or ch>"9":
        valid=False
if valid:
    print("YES")
else:
    print("NO")
---
s=input()
start=0
if len(s)>0 and (s[0]=="+" or s[0]=="-"):
    start=1
ok=start<len(s)
for i in range(start,len(s)):
    if s[i] not in "0123456789":
        ok=False
if ok:
    print("YES")
else:
    print("NO")''',[(s,) for s in ['+12','-0','001','','+','-','1-2',' 12','12 ','12a','++2','0']],lambda s:'YES' if re.fullmatch(r'[+-]?[0-9]+',s) else 'NO')
add(106,3,'distinct-digits','Какие цифры встретились','проверку вхождения символов без множества',
    'Посчитайте, сколько разных цифр 0..9 встречается в строке. Повторы одной цифры считаются один раз.',
    'Строка длиной 0..1000.','Число от 0 до 10.',
    r'''s=input()
count=0
for digit in "0123456789":
    if digit in s:
        count+=1
print(count)
---
s=input()
count=0
for i in range(len(s)):
    if s[i] in "0123456789" and s.find(s[i])==i:
        count+=1
print(count)''',[(s,) for s in STRINGS+['0123456789','11110011','a9b9c0']],lambda s:len(set(s)&set('0123456789')))
add(106,3,'same-position','Совпадения на одинаковых позициях','общий безопасный диапазон индексов двух строк',
    'Посчитайте позиции, на которых в двух строках стоят одинаковые символы. Рассматривайте только позиции, которые существуют в обеих строках.',
    'Две строки длиной 0..1000.','Количество совпадений.',
    r'''a=input()
b=input()
count=0
for i in range(min(len(a),len(b))):
    if a[i]==b[i]:
        count+=1
print(count)
---
a=input()
b=input()
answer=0
for i in range(len(a)):
    if i<len(b):
        if a[i]==b[i]:
            answer+=1
print(answer)''',TEXTS+[('abc','axc'),('','abc'),('ab',''),('',''),('a a','a a')],lambda a,b:sum(x==y for x,y in zip(a,b)))
add(106,3,'word-count','Слова между обычными пробелами','распознавание начала слова по предыдущему символу',
    'Словом считается непустая группа символов между обычными пробелами. Найдите количество слов без split и без списка.',
    'Строка длиной 0..1000; табуляций нет.','Количество слов.',
    r'''s=input()
count=0
inside=False
for ch in s:
    if ch!=" " and not inside:
        count+=1
    inside=ch!=" "
print(count)
---
s=input()
answer=0
for i in range(len(s)):
    if s[i]!=" " and (i==0 or s[i-1]==" "):
        answer+=1
print(answer)''',[(s,) for s in STRINGS+['    ',' a   b  c','x y']],lambda s:len(s.split()))
add(106,4,'double-vowels','Удвоить английские гласные','посимвольную сборку строки с условным повторением',
    'Удвойте каждую английскую гласную a,e,i,o,u, включая заглавные. Остальные символы сохраните, регистр не меняйте.',
    'Строка длиной 0..1000.','Преобразованная строка в квадратных скобках.',
    r'''s=input()
result=""
for ch in s:
    result+=ch
    if ch.lower() in "aeiou":
        result+=ch
print("["+result+"]")
---
s=input()
result=""
for ch in s:
    if ch in "aeiouAEIOU":
        result+=ch*2
    else:
        result+=ch
print("["+result+"]")''',[(s,) for s in STRINGS+['AEIOU','sky','Aa 1e']],lambda s:'['+re.sub(r'[aeiou]',lambda m:m[0]*2,s,flags=re.I)+']')
add(106,4,'hyphen-case','Заглавная после дефиса','состояние предыдущего символа при смене регистра',
    'Сделайте первую латинскую букву строки заглавной, если она стоит на индексе 0. Также сделайте заглавной букву сразу после каждого дефиса. Остальные буквы сделайте строчными; сами дефисы сохраните.',
    'Строка из латинских букв и дефисов длиной 0..1000.','Преобразованная строка в квадратных скобках.',
    r'''s=input().lower()
result=""
for i in range(len(s)):
    if i==0 or s[i-1]=="-":
        result+=s[i].upper()
    else:
        result+=s[i]
print("["+result+"]")
---
s=input()
result=""
upper=True
for ch in s:
    if upper:
        result+=ch.upper()
    else:
        result+=ch.lower()
    upper=ch=="-"
print("["+result+"]")''',[(s,) for s in ['ann-marie','PYTHON','a--b','-a-b-','---','','x','AB-cD']],lambda s:'['+re.sub(r'(^|-)([a-z])',lambda m:m[1]+m[2].upper(),s.lower())+']')
add(106,3,'last-longest-run','Конец самой длинной серии','серии одинаковых символов и выбор последней при равенстве',
    'Найдите индекс последнего символа самой длинной серии одинаковых символов. При равной длине выберите более позднюю серию. Индексы с 0. Для пустой строки выведите -1.',
    'Строка длиной 0..1000.','Индекс либо -1.',
    r'''s=input()
length=0
best=0
answer=-1
for i in range(len(s)):
    if i==0 or s[i]!=s[i-1]:
        length=1
    else:
        length+=1
    if length>=best:
        best=length
        answer=i
print(answer)
---
s=input()
start=0
best=0
answer=-1
for i in range(len(s)):
    if i==0 or s[i]!=s[i-1]:
        start=i
    current=i-start+1
    if current>=best:
        best=current
        answer=i
print(answer)''',[(s,) for s in STRINGS+['aabb','aaabbb','aaaa','aa bbbb cc']],lambda s:max(((len(m[0]),m.end()-1) for m in re.finditer(r'(.)\1*',s)),default=(0,-1))[1])

# while: unknown iteration counts, sentinel input, arithmetic digit processing.
def stopped(args):
    return ''.join(str(x)+'\n' for x in args[0])+'STOP\n'

add(107,0,'positive-until-stop','Сумма положительных до STOP','цикл до текстового сигнала с условным накоплением',
    'Пока не встретится строка STOP, считывайте целые числа. Сложите только строго положительные. Строка STOP в сумму не входит. Используйте while.',
    'От 0 до 100 целых чисел от -1000 до 1000, каждое на новой строке; затем STOP.','Сумма или 0.',
    r'''line=input()
total=0
while line!="STOP":
    value=int(line)
    if value>0:
        total+=value
    line=input()
print(total)
---
answer=0
while True:
    line=input()
    if line=="STOP":
        break
    n=int(line)
    if n>0:
        answer=answer+n
print(answer)''',[(s,) for s in SEQS],lambda s:sum(x for x in s if x>0),stopped)
add(107,0,'password-attempts','Попытки до верного пароля','чтение нового значения внутри while и подсчёт попыток',
    'Считывайте строки до точного пароля python. Выведите количество прочитанных строк, включая верный пароль. Используйте while.',
    'От 1 до 100 строк. Последняя — python; раньше точного python нет. Регистр важен.','Число попыток.',
    r'''attempts=1
password=input()
while password!="python":
    attempts+=1
    password=input()
print(attempts)
---
count=0
while True:
    value=input()
    count+=1
    if value=="python":
        break
print(count)''',[(x,) for x in [[],['Python'],[''],['x','y'],['PYTHON','python '],['1']*20,['p','py','pyt','pyth','pytho']]],lambda s:len(s)+1,lambda args:'\n'.join(args[0]+['python'])+'\n')
add(107,1,'last-before-zero','Последнее число перед сигналом','сохранение последнего значения в цикле до нуля',
    'Читайте ненулевые числа до сигнала 0. Выведите последнее ненулевое число. Если сразу пришёл 0, выведите NONE. Используйте while.',
    'До 100 ненулевых целых чисел от -1000 до 1000, затем 0, по одному на строке.','Последнее число или NONE.',
    r'''x=int(input())
last="NONE"
while x!=0:
    last=x
    x=int(input())
print(last)
---
last="NONE"
while True:
    number=int(input())
    if number==0:
        break
    last=number
print(last)''',[(s,) for s in [[],[1],[-1],[2,3],[-2,4,-7],[9]*10,[1000,-1000]]],lambda s:s[-1] if s else 'NONE',lambda args:'\n'.join(map(str,args[0]+[0]))+'\n')
add(107,2,'digit-occurrences','Сколько раз встречается цифра','цифры числа через остаток и особый случай нуля',
    'Найдите количество вхождений цифры d в десятичной записи неотрицательного числа n. Число 0 записано одной цифрой 0. Используйте while и арифметику, без str.',
    'n от 0 до 10**12, затем d от 0 до 9.','Количество вхождений.',
    r'''n=int(input())
d=int(input())
count=0
if n==0 and d==0:
    count=1
while n>0:
    if n%10==d:
        count+=1
    n//=10
print(count)
---
n=int(input())
d=int(input())
answer=0
while True:
    digit=n%10
    if digit==d:
        answer+=1
    n//=10
    if n==0:
        break
print(answer)''',[(0,0),(0,5),(1000,0),(12321,2),(77777,7),(1234,9),(10**12,0),(9,9)],lambda n,d:str(n).count(str(d)))
add(107,2,'trailing-zeroes','Нули на конце записи','цикл по конечным нулям вместо обработки всего числа',
    'Посчитайте нули в конце записи положительного целого n. Используйте while и арифметику, без строк.',
    'n от 1 до 10**12.','Число конечных нулей.',
    r'''n=int(input())
count=0
while n%10==0:
    count+=1
    n//=10
print(count)
---
n=int(input())
zeros=0
while n>0:
    digit=n%10
    if digit!=0:
        break
    zeros+=1
    n=n//10
print(zeros)''',[(x,) for x in [1,10,100,1010,1001,900000,10**12,1200300]],lambda n:len(str(n))-len(str(n).rstrip('0')))
add(107,2,'reverse-number','Число из обратных цифр','накопление нового числа при выделении цифр',
    'Разверните десятичные цифры неотрицательного n. Выведите именно число: у результата ведущих нулей нет. Решите while и арифметикой без str.',
    'n от 0 до 10**12.','Полученное целое число.',
    r'''n=int(input())
answer=0
while n>0:
    answer=answer*10+n%10
    n//=10
print(answer)
---
n=int(input())
result=0
while n!=0:
    digit=n%10
    result*=10
    result+=digit
    n=(n-digit)//10
print(result)''',[(x,) for x in [0,1,10,100,1203,12321,100000000001,10**12,98765]],lambda n:int(str(n)[::-1]))
add(107,2,'digit-range','Разница максимальной и минимальной цифры','два экстремума при последовательном разборе цифр',
    'Найдите разницу между наибольшей и наименьшей цифрой неотрицательного числа. Для n=0 обе цифры равны 0. Используйте while без строк.',
    'n от 0 до 10**12.','Число от 0 до 9.',
    r'''n=int(input())
largest=n%10
smallest=n%10
while n>0:
    digit=n%10
    largest=max(largest,digit)
    smallest=min(smallest,digit)
    n//=10
print(largest-smallest)
---
n=int(input())
low=9
high=0
while True:
    digit=n%10
    if digit<low:
        low=digit
    if digit>high:
        high=digit
    n//=10
    if n==0:
        break
print(high-low)''',[(x,) for x in [0,7,1111,909,123456789,1000000000,555650,10**12]],lambda n:max(map(int,str(n)))-min(map(int,str(n))))
add(107,3,'double-until','Удваивать до нужного запаса','условие остановки при достижении цели',
    'Начальный запас start положителен. Удваивайте его, пока он меньше goal. Выведите число удвоений и конечный запас. Если цели уже достигли, удвоений 0. Используйте while.',
    'start и goal от 1 до 10**9 на разных строках.','Два целых числа.',
    r'''value=int(input())
goal=int(input())
steps=0
while value<goal:
    value*=2
    steps+=1
print(steps,value)
---
start=int(input())
goal=int(input())
power=1
count=0
while start*power<goal:
    count+=1
    power*=2
print(count,start*power)''',[(1,1),(1,2),(1,3),(3,12),(3,13),(10,1),(1,10**9),(10**9,10**9)],lambda s,g:next(joined([k,s*2**k]) for k in range(31) if s*2**k>=g))
add(107,3,'repeated-purchases','Покупать, пока хватает денег','while с условием, проверяемым до следующего действия',
    'При балансе money покупайте предмет по price, пока хватает денег. Выведите число покупок и оставшийся баланс. Используйте while, а не // и %.',
    'money от 0 до 10000, price от 1 до 1000.','Два целых числа.',
    r'''money=int(input())
price=int(input())
count=0
while money>=price:
    money-=price
    count+=1
print(count,money)
---
money=int(input())
price=int(input())
spent=0
count=0
while spent+price<=money:
    spent+=price
    count+=1
print(count,money-spent)''',[(0,1),(1,1),(9,10),(10,10),(11,10),(10000,1),(10000,999),(10,3)],lambda n,p:joined(divmod(n,p)))
add(107,4,'integer-root','Наибольший квадрат не больше числа','поиск первого неподходящего кандидата циклом while',
    'Найдите наибольшее целое k>=0, для которого k*k<=n. Используйте while без sqrt и степеней с дробным показателем.',
    'n от 0 до 1000000.','Целое k.',
    r'''n=int(input())
k=0
while (k+1)*(k+1)<=n:
    k+=1
print(k)
---
n=int(input())
k=0
while k*k<=n:
    k+=1
print(k-1)''',[(x,) for x in [0,1,2,3,4,8,9,15,16,999999,1000000]],lambda n:math.isqrt(n))
add(107,0,'equal-neighbours-stop','До двух одинаковых подряд','условие продолжения с предыдущим значением',
    'Читайте числа до первого совпадения двух соседних. Выведите количество прочитанных чисел, включая второе число совпавшей пары. Используйте while.',
    'Последовательность из 2..100 целых чисел от -100 до 100; совпавшие соседи гарантированно встретятся, после первой такой пары вход заканчивается.','Количество прочитанных чисел.',
    r'''previous=int(input())
current=int(input())
count=2
while current!=previous:
    previous=current
    current=int(input())
    count+=1
print(count)
---
last=int(input())
count=1
while True:
    x=int(input())
    count+=1
    if x==last:
        break
    last=x
print(count)''',[(s,) for s in [[0,0],[1,1],[1,2,2],[-1,0,1,1],[1,2,1,2,2],[3,2,1,0,0],[-5,-4,-3,-3]]],lambda s:len(s),lambda args:'\n'.join(map(str,args[0]))+'\n')
add(107,4,'decimal-length','Сколько делений до одной цифры','число повторений при уменьшении числа',
    'Пока число n не станет однозначным (меньше 10), отбрасывайте последнюю цифру. Выведите число таких действий и оставшуюся первую цифру. Используйте while.',
    'n от 0 до 10**12.','Число действий и первая цифра.',
    r'''n=int(input())
steps=0
while n>=10:
    n//=10
    steps+=1
print(steps,n)
---
value=int(input())
count=0
while value//10>0:
    value=value//10
    count=count+1
print(count,value)''',[(x,) for x in [0,9,10,99,100,1001,999999,10**12,7000000]],lambda n:f'{len(str(n))-1} {str(n)[0]}')

# Lists: content, indexed mutation, copying and the order of elements.
LISTS=SEQS+[[-3,3,-3,0,3],[9,1,9,1,0]]
NUMREAD='a=list(map(int,input().split()))\n'
add(108,0,'reverse-alternate','Через один в обратном порядке','срез списка с отрицательным шагом',
    'Выведите последний элемент списка, затем третий с конца, затем пятый с конца и так далее.',
    'Одна строка из 0..100 целых чисел от -100 до 100. Пустая строка означает пустой список.','Выбранные числа через пробел или пустая строка.',
    NUMREAD+r'''print(*a[::-2])
---
a=list(map(int,input().split()))
answer=[]
for i in range(len(a)-1,-1,-2):
    answer.append(a[i])
print(*answer)''',[(s,) for s in LISTS],lambda s:joined(list(reversed(s))[::2]))
add(108,0,'repeat-list','Повторить весь список','различие повторения списка и умножения его значений',
    'Повторите весь список k раз подряд. При k=0 результат пустой. Значения самих элементов не умножайте.',
    'Строка из 0..30 целых чисел от -100 до 100; затем k от 0 до 5.','Результат через пробел или пустая строка.',
    NUMREAD+r'''k=int(input())
print(*(a*k))
---
a=list(map(int,input().split()))
k=int(input())
result=[]
for i in range(k):
    result+=a
print(*result)''',[(s,k) for s in LISTS[:10] for k in [0,1,3]],lambda s,k:joined([x for _ in range(k) for x in s]))
add(108,1,'stable-unique','Оставить первые появления','накопление уникальных значений в списке с сохранением порядка',
    'Оставьте в списке только первое вхождение каждого значения. Порядок первых появлений сохраните. Множества не используйте.',
    'Строка из 0..100 целых чисел от -100 до 100.','Результат через пробел или пустая строка.',
    NUMREAD+r'''result=[]
for x in a:
    if x not in result:
        result.append(x)
print(*result)
---
a=list(map(int,input().split()))
answer=[]
for i in range(len(a)):
    if a.index(a[i])==i:
        answer.append(a[i])
print(*answer)''',[(s,) for s in LISTS],lambda s:joined(dict.fromkeys(s)))
add(108,1,'zeros-after-negative','Ноль после отрицательного','создание нового списка с дополнительными элементами',
    'После каждого отрицательного числа вставьте один ноль. Исходные элементы и их порядок сохраните.',
    'Строка из 0..100 целых чисел от -100 до 100.','Изменённый список через пробел или пустая строка.',
    NUMREAD+r'''result=[]
for x in a:
    result.append(x)
    if x<0:
        result.append(0)
print(*result)
---
a=list(map(int,input().split()))
for i in range(len(a)-1,-1,-1):
    if a[i]<0:
        a.insert(i+1,0)
print(*a)''',[(s,) for s in LISTS],lambda s:joined(y for x in s for y in ([x,0] if x<0 else [x])))
add(108,2,'drop-first-max','Удалить только первый максимум','метод remove и сохранение повторных максимальных значений',
    'Из непустого списка удалите только первое вхождение наибольшего числа. Остальные элементы не переставляйте.',
    'От 1 до 100 целых чисел от -100 до 100 в одной строке.','Оставшиеся числа через пробел или пустая строка.',
    NUMREAD+r'''a.remove(max(a))
print(*a)
---
a=list(map(int,input().split()))
index=a.index(max(a))
del a[index]
print(*a)''',[(s,) for s in LISTS if s],lambda s:joined(s[:s.index(max(s))]+s[s.index(max(s))+1:]))
add(108,2,'sorted-copy-original','Отсортированная копия и исходный список','копирование до sort и различие изменения объекта и копии',
    'Создайте копию списка и отсортируйте её по возрастанию. Выведите отсортированную копию, а на следующей строке исходный список в прежнем порядке.',
    'От 1 до 100 целых чисел от -100 до 100 в одной строке.','Две строки.',
    NUMREAD+r'''b=a.copy()
b.sort()
print(*b)
print(*a)
---
a=list(map(int,input().split()))
b=a[:]
b.sort()
print(*b)
print(*a)''',[(s,) for s in LISTS if s],lambda s:joined(sorted(s))+'\n'+joined(s))
add(108,3,'prefix-maxima','Наибольшее с начала списка','список промежуточных максимумов и доступ по индексу',
    'Для каждой позиции выведите максимум всех элементов от начала списка до этой позиции включительно.',
    'Строка из 0..100 целых чисел от -100 до 100.','Список максимумов или пустая строка.',
    NUMREAD+r'''result=[]
for i in range(len(a)):
    if i==0:
        best=a[i]
    else:
        best=max(best,a[i])
    result.append(best)
print(*result)
---
a=list(map(int,input().split()))
answer=[]
for i in range(len(a)):
    answer.append(max(a[:i+1]))
print(*answer)''',[(s,) for s in LISTS],lambda s:joined(sorted(s[:i+1])[-1] for i in range(len(s))))
add(108,3,'suffix-sums','Сумма от каждой позиции до конца','обратный проход и запись результата по индексу',
    'Для каждой позиции посчитайте сумму от её элемента до конца списка включительно. Ответы выведите в порядке исходных позиций.',
    'Строка из 0..100 целых чисел от -100 до 100.','Список сумм или пустая строка.',
    NUMREAD+r'''answer=[0]*len(a)
total=0
for i in range(len(a)-1,-1,-1):
    total+=a[i]
    answer[i]=total
print(*answer)
---
a=list(map(int,input().split()))
result=[]
for i in range(len(a)):
    result.append(sum(a[i:]))
print(*result)''',[(s,) for s in LISTS],lambda s:joined(sum(s)-sum(s[:i]) for i in range(len(s))))
add(108,4,'min-positions','Все индексы минимального элемента','поиск всех позиций вместо одного index',
    'Выведите индексы всех элементов, равных минимуму списка. Индексы начинаются с 0 и идут по возрастанию.',
    'Непустая строка из 1..100 целых чисел от -100 до 100.','Индексы через пробел.',
    NUMREAD+r'''smallest=min(a)
result=[]
for i in range(len(a)):
    if a[i]==smallest:
        result.append(i)
print(*result)
---
a=list(map(int,input().split()))
answer=[]
minimum=a[0]
for i in range(len(a)):
    if a[i]<minimum:
        minimum=a[i]
        answer=[i]
    elif a[i]==minimum:
        answer.append(i)
print(*answer)''',[(s,) for s in LISTS if s],lambda s:joined(i for i,x in enumerate(s) if x==min(s)))
add(108,4,'replace-section','Заполнить участок одним значением','изменение элементов списка по диапазону индексов',
    'Замените элементы с индекса left до right включительно на число value. Остальные элементы не меняйте.',
    'Непустой список до 100 целых чисел от -100 до 100 в первой строке; left,right,value на следующих строках. 0<=left<=right<len(списка), value от -100 до 100.','Изменённый список.',
    NUMREAD+r'''left=int(input())
right=int(input())
value=int(input())
for i in range(left,right+1):
    a[i]=value
print(*a)
---
a=list(map(int,input().split()))
left=int(input())
right=int(input())
value=int(input())
a[left:right+1]=[value]*(right-left+1)
print(*a)''',[(s,l,r,-7) for s in LISTS[:10] if s for l,r in [(0,0),(0,len(s)-1),(len(s)-1,len(s)-1)]],lambda s,l,r,v:joined(v if l<=i<=r else x for i,x in enumerate(s)))
add(108,1,'paired-difference','Разности элементов двух списков','общий индекс двух списков и отдельный результат',
    'Даны два списка одинаковой длины. Постройте список, в котором элемент i равен первому элементу i минус второму элементу i.',
    'Два списка из 0..100 целых чисел от -100 до 100, каждый в своей строке. Длины равны.','Разности через пробел или пустая строка.',
    NUMREAD+r'''b=list(map(int,input().split()))
result=[]
for i in range(len(a)):
    result.append(a[i]-b[i])
print(*result)
---
a=list(map(int,input().split()))
b=list(map(int,input().split()))
for i in range(len(a)):
    a[i]-=b[i]
print(*a)''',[(s,list(reversed(s))) for s in LISTS],lambda a,b:joined(x-y for x,y in zip(a,b)))
add(108,4,'remove-kth-positions','Убрать каждый k-й элемент','различие индекса с нуля и порядкового номера с единицы',
    'Удалите каждый k-й элемент: с номерами k,2k,3k,... . Номера начинаются с 1; порядок оставшихся чисел сохраните.',
    'Список из 0..100 целых чисел от -100 до 100, затем k от 1 до 100.','Оставшиеся числа через пробел или пустая строка.',
    NUMREAD+r'''k=int(input())
result=[]
for i in range(len(a)):
    if (i+1)%k!=0:
        result.append(a[i])
print(*result)
---
a=list(map(int,input().split()))
k=int(input())
for i in range(len(a)-1,-1,-1):
    if (i+1)%k==0:
        del a[i]
print(*a)''',[(s,k) for s in LISTS[:10] for k in [1,2,100]],lambda s,k:joined(x for i,x in enumerate(s,1) if i%k!=0))

# Standalone comprehensions: transformation, index relations and nested scopes.
GS=[[-4,0,3,-2],[],[0],[1,2,3],[-1,-1,-1],[4,4,1],[9,-9,0,16]]+SEQS[10:]
WS=[['Apple','code','a','RADAR'],[],['x'],['AA','Bb','cc'],['топот','Дом','Око'],['one','two','one'],['a-b','--','A!'],['AB','ba','aba']]
WORDREAD='words=input().split()\n'
add(112,0,'collatz-step','Один шаг для каждого числа','условное выражение внутри генератора без удаления элементов',
    'Для каждого числа замените чётное на его половину (целое число), нечётное — на 3*x+1. Порядок сохраните.',
    'Строка из 0..100 целых чисел от -1000 до 1000.','Полученный список или пустая строка.',
    NUMREAD+r'''result=[x//2 if x%2==0 else 3*x+1 for x in a]
print(*result)
---
a=list(map(int,input().split()))
result=[3*a[i]+1 if a[i]%2!=0 else a[i]//2 for i in range(len(a))]
print(*result)''',[(s,) for s in GS],lambda s:joined(x//2 if not x%2 else 3*x+1 for x in s))
add(112,0,'exact-quotients','Частные только для кратных','фильтр до вычисления выражения',
    'Оставьте числа, кратные k, и разделите каждое из них на k нацело. Нули и отрицательные числа учитываются по тому же правилу.',
    'Список из 0..100 целых чисел от -1000 до 1000, затем k от 1 до 100.','Частные через пробел или пустая строка.',
    NUMREAD+r'''k=int(input())
result=[x//k for x in a if x%k==0]
print(*result)
---
a=list(map(int,input().split()))
k=int(input())
selected=[x for x in a if x%k==0]
answer=[value//k for value in selected]
print(*answer)''',[(s,k) for s in GS[:7] for k in [1,2,3]],lambda s,k:joined(int(x/k) for x in s if x%k==0))
add(112,0,'twice-letter','Слова с двумя буквами a','метод count в условии генератора и нормализацию регистра',
    'Выберите слова, в которых латинская буква a встречается ровно два раза без учёта регистра. Выбранные слова выведите строчными.',
    'Строка из 0..100 слов без пробелов внутри.','Выбранные слова или пустая строка.',
    WORDREAD+r'''result=[word.lower() for word in words if word.lower().count("a")==2]
print(*result)
---
words=input().split()
lower=[word.lower() for word in words]
answer=[word for word in lower if word.count("a")==2]
print(*answer)''',[(s,) for s in WS+[['aA','aaa','banana','data','A-b-A']]],lambda s:joined(w.lower() for w in s if len(re.findall('a',w,re.I))==2))
add(112,0,'clean-nonempty','Очистить метки и убрать пустые','условие после строкового преобразования',
    'Удалите ! и ? с обоих краёв каждого слова. Не включайте результат в список, если после очистки он пустой. Знаки внутри сохраняйте.',
    'Строка из 0..100 слов без пробелов внутри.','Очищенные непустые слова или пустая строка.',
    WORDREAD+r'''result=[word.strip("!?") for word in words if word.strip("!?")!=""]
print(*result)
---
words=input().split()
cleaned=[word.strip("!?") for word in words]
result=[word for word in cleaned if len(word)>0]
print(*result)''',[(s,) for s in WS+[['!?a?!','!!!','b?c','?'],['!','?','!?']]],lambda s:joined(filter(None,[re.sub(r'^[!?]+|[!?]+$','',w) for w in s])))
add(112,0,'last-letter-up','Заглавная последняя буква','срез и индекс в преобразовании каждого слова',
    'В каждом слове сделайте все буквы строчными, а последнюю букву — заглавной. Слово из одной буквы станет заглавным.',
    'Строка из 0..100 непустых слов, состоящих только из букв.','Изменённые слова или пустая строка.',
    WORDREAD+r'''result=[w[:-1].lower()+w[-1].upper() for w in words]
print(*result)
---
words=input().split()
lower=[w.lower() for w in words]
result=[w[:len(w)-1]+w[len(w)-1].upper() for w in lower]
print(*result)''',[(s,) for s in WS[:6]+[['Ab','Ёж'],['a','B','c']]],lambda s:joined(w.lower()[:-1]+w[-1].upper() for w in s))
add(112,0,'hyphens-underscores','Метки с подчёркиваниями','композицию двух методов строки в генераторе',
    'В каждом слове замените все дефисы на подчёркивания и сделайте буквы строчными. Никакие слова не удаляйте.',
    'Строка из 0..100 слов без пробелов внутри.','Изменённые слова или пустая строка.',
    WORDREAD+r'''result=[w.replace("-","_").lower() for w in words]
print(*result)
---
words=input().split()
result=[words[i].lower().replace("-","_") for i in range(len(words))]
print(*result)''',[(s,) for s in WS+[['A-B','--Hi--','plain'],['-','a--b']]],lambda s:joined(re.sub('-', '_',w.lower()) for w in s))
add(112,0,'reverse-odd-words','Перевернуть слова нечётной длины','преобразование одних элементов и сохранение остальных',
    'Слова нечётной длины переверните, остальные оставьте прежними. Порядок слов не меняйте.',
    'Строка из 0..100 непустых слов.','Результат или пустая строка.',
    WORDREAD+r'''result=[w[::-1] if len(w)%2==1 else w for w in words]
print(*result)
---
words=input().split()
answer=[words[i] if len(words[i])%2==0 else words[i][::-1] for i in range(len(words))]
print(*answer)''',[(s,) for s in WS],lambda s:joined(''.join(reversed(w)) if len(w)%2 else w for w in s))
add(112,0,'deviations-limit','Только далёкие от цели','фильтрацию по расстоянию и сохранение знака отклонения',
    'Оставьте числа, расстояние которых от target строго больше d. Вместо каждого выведите отклонение x-target со знаком.',
    'Список до 100 целых от -1000 до 1000, затем target от -1000 до 1000 и d от 0 до 1000 на разных строках.','Отклонения или пустая строка.',
    NUMREAD+r'''target=int(input())
d=int(input())
result=[x-target for x in a if abs(x-target)>d]
print(*result)
---
a=list(map(int,input().split()))
target=int(input())
d=int(input())
changes=[x-target for x in a]
result=[x for x in changes if x>d or x<-d]
print(*result)''',[(s,t,d) for s in GS[:7] for t,d in [(0,0),(0,3),(2,2)]],lambda s,t,d:joined(x-t for x in s if (x-t)**2>d*d))
add(112,1,'above-mean','Элементы выше среднего','сравнение значения с агрегатом всего списка',
    'Выберите элементы, которые строго больше среднего арифметического исходного списка. Порядок и повторы сохраните.',
    'Непустой список из 1..100 целых чисел от -1000 до 1000.','Выбранные числа или пустая строка.',
    NUMREAD+r'''total=sum(a)
result=[x for x in a if x*len(a)>total]
print(*result)
---
a=list(map(int,input().split()))
average=sum(a)/len(a)
answer=[a[i] for i in range(len(a)) if a[i]>average]
print(*answer)''',[(s,) for s in GS if s],lambda s:joined(x for x in s if x>sum(s)/len(s)))
add(112,1,'local-minima','Индексы строгих впадин','диапазон внутренних индексов и два сравнения соседей',
    'Найдите индексы элементов, которые строго меньше обоих соседей. Крайние элементы не рассматривайте. Индексы начинаются с 0.',
    'Список из 0..100 целых чисел от -100 до 100.','Индексы или пустая строка.',
    NUMREAD+r'''result=[i for i in range(1,len(a)-1) if a[i]<a[i-1] and a[i]<a[i+1]]
print(*result)
---
a=list(map(int,input().split()))
answer=[j+1 for j in range(len(a)-2) if a[j+1]<min(a[j],a[j+2])]
print(*answer)''',[(s,) for s in GS+[[3,1,3],[3,1,1,3],[0,-2,0,-2,0]]],lambda s:joined(i for i in range(len(s)) if 0<i<len(s)-1 and s[i]==min(s[i-1:i+2]) and s[i-1]!=s[i] and s[i+1]!=s[i]))
add(112,1,'run-ends','Последние индексы серий','правую границу серии и короткое замыкание or',
    'Для каждой серии одинаковых подряд идущих чисел выведите индекс её последнего элемента. Индексы начинаются с 0.',
    'Список из 0..100 целых чисел от -100 до 100.','Индексы или пустая строка.',
    NUMREAD+r'''result=[i for i in range(len(a)) if i==len(a)-1 or a[i]!=a[i+1]]
print(*result)
---
a=list(map(int,input().split()))
result=[j-1 for j in range(1,len(a)+1) if j==len(a) or a[j-1]!=a[j]]
print(*result)''',[(s,) for s in GS+[[1,1,2,2,3],[4,4,4]]],lambda s:joined(m.end()-1 for m in re.finditer(r'(.)\1*',''.join(chr(x+200) for x in s))))
add(112,1,'above-neighbour-mean','Выше среднего двух соседей','вычисление по соседям в фильтре генератора',
    'Выведите внутренние элементы, которые строго больше среднего арифметического их левого и правого соседей. Края не включайте.',
    'Список из 0..100 целых чисел от -100 до 100.','Значения в исходном порядке или пустая строка.',
    NUMREAD+r'''result=[a[i] for i in range(1,len(a)-1) if 2*a[i]>a[i-1]+a[i+1]]
print(*result)
---
a=list(map(int,input().split()))
answer=[a[j+1] for j in range(len(a)-2) if a[j+1]>(a[j]+a[j+2])/2]
print(*answer)''',[(s,) for s in GS+[[0,1,0],[0,1,2],[5,3,0]]],lambda s:joined(b for a,b,c in zip(s,s[1:],s[2:]) if b>(a+c)/2))
add(112,1,'distance-k-products','Произведения на расстоянии k','безопасную правую границу при смещённом индексе',
    'Для каждого i, где существует элемент i+k, вычислите a[i]*a[i+k]. Порядок i — по возрастанию.',
    'Список из 0..100 целых чисел от -100 до 100, затем k от 1 до 100.','Произведения или пустая строка.',
    NUMREAD+r'''k=int(input())
result=[a[i]*a[i+k] for i in range(len(a)-k)]
print(*result)
---
a=list(map(int,input().split()))
k=int(input())
result=[a[j-k]*a[j] for j in range(k,len(a))]
print(*result)''',[(s,k) for s in GS[:7] for k in [1,2,100]],lambda s,k:joined(x*y for x,y in zip(s,s[k:])))
add(112,1,'window-minimum','Минимум в каждом окне','срез фиксированной длины внутри генератора',
    'Для каждого подряд идущего окна из k элементов найдите минимум. Если k больше длины списка, результат пустой.',
    'Список из 0..100 целых чисел от -100 до 100, затем k от 1 до 100.','Минимумы слева направо или пустая строка.',
    NUMREAD+r'''k=int(input())
result=[min(a[i:i+k]) for i in range(len(a)-k+1)]
print(*result)
---
a=list(map(int,input().split()))
k=int(input())
answer=[min(a[end-k:end]) for end in range(k,len(a)+1)]
print(*answer)''',[(s,k) for s in GS[:7] for k in [1,2,100]],lambda s,k:joined(sorted(s[i:i+k])[0] for i in range(max(0,len(s)-k+1))))
add(112,1,'equal-positions','Совпадающие позиции двух списков','один индекс для согласованного доступа к двум спискам',
    'Найдите индексы, на которых у двух списков стоят одинаковые числа. Индексы начинаются с 0.',
    'Два списка одинаковой длины от 0 до 100, числа от -100 до 100; каждый список в своей строке.','Индексы или пустая строка.',
    NUMREAD+r'''b=list(map(int,input().split()))
result=[i for i in range(len(a)) if a[i]==b[i]]
print(*result)
---
a=list(map(int,input().split()))
b=list(map(int,input().split()))
differences=[a[i]-b[i] for i in range(len(a))]
answer=[i for i in range(len(differences)) if differences[i]==0]
print(*answer)''',[(s,list(reversed(s))) for s in GS],lambda a,b:joined(i for i,pair in enumerate(zip(a,b)) if pair[0]==pair[1]))
add(112,1,'reversed-prefixes','Перевёрнутые начала слова','зависимый от индекса срез и преобразование фрагмента',
    'Для слова выведите перевёрнутые префиксы длиной 1,2,...,len(слова). Например, для abc получится a ba cba.',
    'Одна строка из 0..40 букв без пробелов.','Префиксы через пробел или пустая строка.',
    r'''s=input()
result=[s[:i][::-1] for i in range(1,len(s)+1)]
print(*result)
---
s=input()
result=[s[i::-1] for i in range(len(s))]
print(*result)''',[(s,) for s in ['abc','','x','aaaa','Python','ёжик','AbCdE','a'*40]],lambda s:joined(''.join(reversed(s[:k])) for k in range(1,len(s)+1)))
add(112,2,'letters-from-words','Цифры из всех слов','порядок двух вложенных переборов и фильтр символов',
    'Из каждого слова слева направо выпишите только цифры 0..9. Все выбранные цифры выведите отдельными элементами общего списка.',
    'Строка из 0..100 слов без пробелов внутри.','Цифры через пробел или пустая строка.',
    WORDREAD+r'''result=[ch for word in words for ch in word if ch in "0123456789"]
print(*result)
---
words=input().split()
result=[word[i] for word in words for i in range(len(word)) if "0"<=word[i]<= "9"]
print(*result)''',[(s,) for s in WS+[['a12','B3','00x'],['123'],['1x2','x3']]],lambda s:joined(re.findall(r'[0-9]',''.join(s))))
add(112,2,'word-prefixes','Все префиксы каждого слова','внутренний диапазон, зависящий от текущего слова',
    'Для первого слова выведите все его непустые префиксы от короткого к длинному, затем то же для второго и так далее.',
    'Строка из 0..20 слов длиной 1..20.','Префиксы через пробел или пустая строка.',
    WORDREAD+r'''result=[w[:k] for w in words for k in range(1,len(w)+1)]
print(*result)
---
words=input().split()
result=[words[i][:j+1] for i in range(len(words)) for j in range(len(words[i]))]
print(*result)''',[(s,) for s in WS],lambda s:joined(w[:i+1] for w in s for i,_ in enumerate(w)))
add(112,2,'factor-records','Пары множителей числа','вложенный перебор с ограничением и составным фильтром',
    'Найдите пары положительных a,b, для которых a*b=n и a<=b. Выведите пары в формате a:b по возрастанию a. Одна пара учитывается один раз.',
    'n от 1 до 100.','Пары через пробел.',
    r'''n=int(input())
result=[str(a)+":"+str(b) for a in range(1,n+1) for b in range(a,n+1) if a*b==n]
print(*result)
---
n=int(input())
result=[str(a)+":"+str(n//a) for a in range(1,n+1) if n%a==0 and a<=n//a]
print(*result)''',[(x,) for x in [1,2,4,9,12,16,36,97,100]],lambda n:joined(f'{a}:{n//a}' for a in range(1,math.isqrt(n)+1) if n%a==0))
add(112,2,'odd-sum-pairs','Пары с нечётной суммой','два диапазона и фильтр по вычисленному признаку',
    'Переберите a от 1 до n, внутри для каждого a — b от 1 до m. Оставьте пары с нечётной суммой a+b. Формат пары a:b.',
    'n,m от 1 до 10 на разных строках.','Пары в указанном порядке через пробел.',
    r'''n=int(input())
m=int(input())
result=[str(a)+":"+str(b) for a in range(1,n+1) for b in range(1,m+1) if (a+b)%2==1]
print(*result)
---
n=int(input())
m=int(input())
result=[str(i+1)+":"+str(j+1) for i in range(n) for j in range(m) if i%2!=j%2]
print(*result)''',[(1,1),(1,2),(2,1),(2,2),(3,4),(4,3),(10,10)],lambda n,m:joined(f'{a}:{b}' for a in range(1,n+1) for b in range(1,m+1) if (a%2)!=(b%2)))
add(112,2,'word-repeat-stairs','Лесенка повторов для каждого слова','сочетание внешнего перебора слов и внутреннего счётчика',
    'Для каждого слова выведите его повторения 1,2,...,k раз. Сначала все повторы первого слова, затем второго и так далее.',
    'До 20 непустых слов длиной до 20 в первой строке; затем k от 1 до 5.','Полученные слова через пробел или пустая строка.',
    WORDREAD+r'''k=int(input())
result=[w*count for w in words for count in range(1,k+1)]
print(*result)
---
words=input().split()
k=int(input())
answer=[words[i]*(j+1) for i in range(len(words)) for j in range(k)]
print(*answer)''',[(s,k) for s in WS for k in [1,3]],lambda s,k:joined(''.join([w]*i) for w in s for i in range(1,k+1)))
add(112,2,'nearby-index-pairs','Суммы близких позиций','зависимую границу второго индекса без повторов',
    'Для каждой пары индексов i<j на расстоянии не больше k вычислите a[i]+a[j]. Порядок: сначала i по возрастанию, внутри j по возрастанию. Одинаковые суммы не удаляйте.',
    'Список из 0..30 целых чисел от -100 до 100; затем k от 1 до 30.','Суммы через пробел или пустая строка.',
    NUMREAD+r'''k=int(input())
result=[a[i]+a[j] for i in range(len(a)) for j in range(i+1,min(len(a),i+k+1))]
print(*result)
---
a=list(map(int,input().split()))
k=int(input())
answer=[a[i]+a[j] for i in range(len(a)) for j in range(i+1,len(a)) if j-i<=k]
print(*answer)''',[(s,k) for s in GS[:7] for k in [1,2,30]],lambda s,k:joined(x+y for i,x in enumerate(s) for j,y in enumerate(s) if i<j<=i+k))
add(112,2,'divisor-sums','Сумма делителей каждого числа','вложенный генератор как вход для sum',
    'Для каждого числа исходного списка найдите сумму всех его положительных делителей. Порядок и повторы чисел сохраните.',
    'Список из 0..30 целых чисел от 1 до 100.','Суммы делителей через пробел или пустая строка.',
    NUMREAD+r'''result=[sum([d for d in range(1,x+1) if x%d==0]) for x in a]
print(*result)
---
a=list(map(int,input().split()))
divisors=[[d for d in range(1,a[i]+1) if a[i]%d==0] for i in range(len(a))]
result=[sum(row) for row in divisors]
print(*result)''',[(s,) for s in [[1,6,7],[],[1],[2,2],[4,9,16],[97,100],[10,12,15],[36,1]]],lambda s:joined(sum(d for d in range(1,x+1) if not x%d) for x in s))
add(112,2,'border-cells','Координаты рамки прямоугольника','условие на крайние координаты во вложенном генераторе',
    'Переберите клетки прямоугольника из n строк и m столбцов. Оставьте клетки на границе. Выведите координаты row:column; номера с 1. Сначала строки, внутри — столбцы.',
    'n,m от 1 до 10, каждое на новой строке.','Координаты через пробел, без повторов углов.',
    r'''n=int(input())
m=int(input())
result=[str(i)+":"+str(j) for i in range(1,n+1) for j in range(1,m+1) if i==1 or i==n or j==1 or j==m]
print(*result)
---
n=int(input())
m=int(input())
answer=[str(i+1)+":"+str(j+1) for i in range(n) for j in range(m) if not (0<i<n-1 and 0<j<m-1)]
print(*answer)''',[(1,1),(1,5),(5,1),(2,3),(3,2),(4,5),(10,10)],lambda n,m:joined(f'{i}:{j}' for i in range(1,n+1) for j in range(1,m+1) if min(i-1,n-i,j-1,m-j)==0))

def main():
    counts={str(topic):sum(row['topic']==str(topic) for row in QUESTIONS) for topic in TOPICS}
    assert counts=={str(topic):24 if topic==112 else 12 for topic in TOPICS},counts
    assert len({row['question']['id'] for row in QUESTIONS})==120
    payload={'version':'20261016-second','topics':{str(k):{'title':v} for k,v in TOPICS.items()},'questions':QUESTIONS}
    (ROOT/'server/pythonSecondExpansionData.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'output/python-second-expansion-audit-input.json').write_text(json.dumps(AUDIT,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    doc=['# Ещё 120 задач Python — 16 октября 2026','',
         'По 12 задач в каждой из восьми тем до кортежей и 24 в генераторах списков. Старые задачи и прогресс сохраняются. Для каждой написаны два простых решения; они проверяются точным Python runner платформы и не попадают в публичный банк.','']
    for topic,title in TOPICS.items():
        doc += [f'## {title}','','| Задача | Подраздел | Навык | Проверок на одно решение |','|---|---|---|---:|']
        doc += [f"| {t['title']} | {t['section']} | {t['learningGoal']} | {len(t['cases'])} |" for t in AUDIT if t['topic']==topic]
        doc+=['']
    (ROOT/'docs/python-second-expansion-20261016.md').write_text('\n'.join(doc),encoding='utf-8')
    print(json.dumps({'count':len(QUESTIONS),'topics':counts,'cases':sum(len(t['cases']) for t in AUDIT)},ensure_ascii=False))

if __name__=='__main__':
    main()
