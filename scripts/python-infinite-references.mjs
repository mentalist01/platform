// Independent Python solutions; parameters come from each task's wording.
export function infiniteReferenceFor(question) {
  const title = question.title.split(' · ')[0];
  const parameter = Number(title.match(/\d+$/)?.[0]);
  const list = 'n=int(input())\na=list(map(int,input().split()))\n';
  if (title.startsWith('Сумма кратных ')) return list + `print(sum(x for x in a if x % ${parameter} == 0))`;
  if (title.startsWith('Длинные слова от ')) return `print(sum(len(w)>=${parameter} for w in input().split()))`;
  if (title.startsWith('Размах плюс ')) return list + `print(max(a)-min(a)+${parameter})`;
  if (title.startsWith('Символы с множителем ')) return `s=input()\nc=input()\nprint(s.count(c)*${parameter})`;
  if (title.startsWith('Факториал плюс ')) return `n=int(input())\np=1\nfor i in range(2,n+1):\n    p*=i\nprint(p+${parameter})`;
  if (title.startsWith('Произведение остатков по модулю ')) return list + `p=1\nfor x in a:\n    p*=abs(x)%${parameter} or 1\nprint(p)`;
  if (title.startsWith('Сдвиг списка на ')) return list + `k=${parameter}%n\nprint(*[a[(i+k)%n] for i in range(n)])`;
  if (title === 'Слова-палиндромы') return 'print(sum(w==w[::-1] for w in input().split()))';
  if (title.startsWith('Сумма степеней ')) return list + `print(sum(x**${parameter} for x in a))`;
  if (title === 'Сумма циклической диагонали') return 'r,c=map(int,input().split())\ns=0\nfor i in range(r):\n    row=list(map(int,input().split()))\n    s+=row[i%c]\nprint(s)';
  return null;
}
