import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, BarChart2, LogOut, Download, FileText, CheckCircle, 
  Lock, Menu, X, ChevronRight, Folder, FolderPlus, Upload, 
  ArrowLeft, Trash2, PlayCircle, Check, XCircle, Plus, 
  Settings, User, Save, Edit3, Trash 
} from 'lucide-react';

/**
 * CONSTANTS & CONFIG
 */

const TEACHER_CODE = "admin100"; // Код для входа учителя
const STUDENT_CODE = "1234";     // Код для входа ученика

const LEVELS = {
  BASIC: { id: 'basic', label: 'Обязательный', maxScore: 70, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  ADVANCED: { id: 'advanced', label: 'Продвинутый', maxScore: 90, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  EXPERT: { id: 'expert', label: 'Чтоб наверняка', maxScore: 100, color: 'bg-red-100 text-red-700 border-red-200' }
};

// Заглушка списка заданий
const MOCK_TASKS = Array.from({ length: 27 }, (_, i) => ({
  id: i + 1,
  number: i + 1,
  title: [
    "Анализ информационных моделей", "Таблицы истинности", "Поиск в БД", "Кодирование (Фано)", 
    "Анализ алгоритмов", "Циклы", "Изображения/Звук", "Комбинаторика", "Excel", "Word", 
    "Вычисление информации", "Исполнители", "Графы", "Системы счисления", "Алгебра логики", 
    "Рекурсия", "Последовательности", "Робот (ДП)", "Теория игр (1)", "Теория игр (2)", 
    "Теория игр (3)", "Многопроцессорные", "Динамика (Исполнитель)", "Строки", "Маски чисел", 
    "Жадные алгоритмы", "Анализ данных (Сложная)"
  ][i] || `Задание ${i + 1}`,
  topic: "Тема задания",
  mastery: 0
}));

// Начальная база вопросов
const INITIAL_TEST_DB = {
  1: {
    basic: [
      { id: 1, question: "Базовый вопрос №1 для задания 1: Найдите длину пути А-Д.", options: ["10", "12", "14", "15"], correctIndex: 1 },
      { id: 2, question: "Базовый вопрос №2 для задания 1: Сколько путей из А в Г?", options: ["3", "4", "5", "6"], correctIndex: 2 }
    ],
    advanced: [],
    expert: []
  }
};

const INITIAL_FILES = [
  { id: 101, taskNumber: 1, category: 'class', name: 'Презентация_Графы.pdf', size: '2.4 MB', date: '2023-10-01' },
];

/**
 * API SERVICE (MOCKED)
 */
const api = {
  login: (email, code) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (code === TEACHER_CODE) {
          resolve({ id: 'admin1', name: 'Иван Викторович', email, role: 'teacher' });
        } else if (code === STUDENT_CODE || code.length > 3) {
          resolve({ id: 'u1', name: 'Ученик', email, role: 'student' });
        } else {
          reject('Неверный код доступа');
        }
      }, 800);
    });
  },
  getTests: () => {
    const stored = localStorage.getItem('ege_teacher_tests');
    return stored ? JSON.parse(stored) : INITIAL_TEST_DB;
  },
  saveTests: (newDb) => {
    localStorage.setItem('ege_teacher_tests', JSON.stringify(newDb));
  },
  getProgress: () => new Promise(r => setTimeout(() => r(MOCK_TASKS), 600)),
  uploadFile: (file, taskNumber, category) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (file.size > 20 * 1024 * 1024) return reject("Файл > 20МБ");
        resolve({
          id: Date.now(),
          taskNumber,
          category,
          name: file.name,
          size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
          date: new Date().toLocaleDateString()
        });
      }, 800);
    });
  }
};

/**
 * SHARED COMPONENTS
 */
const Button = ({ children, onClick, variant = 'primary', className = '', ...props }) => {
  const baseStyle = "px-4 py-2 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200",
    secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
    ghost: "text-gray-500 hover:bg-gray-100 hover:text-purple-600",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    success: "bg-green-600 text-white hover:bg-green-700"
  };
  return <button className={`${baseStyle} ${variants[variant]} ${className}`} onClick={onClick} {...props}>{children}</button>;
};

const Card = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 ${onClick ? 'cursor-pointer hover:border-purple-200 active:scale-[0.99]' : ''} ${className}`}>{children}</div>
);

const ProgressBar = ({ value }) => {
  let color = 'bg-gray-200';
  if (value > 0) color = 'bg-blue-400';
  if (value >= 70) color = 'bg-purple-500';
  if (value >= 90) color = 'bg-green-500';
  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden mt-2">
      <div className={`h-2.5 rounded-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${value}%` }}></div>
    </div>
  );
};

/**
 * TEACHER PANEL COMPONENT
 */
const TeacherPanel = () => {
  const [testDb, setTestDb] = useState(api.getTests());
  const [selectedTask, setSelectedTask] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState('basic');
  
  // Form state
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIdx, setCorrectIdx] = useState(0);

  const handleOptionChange = (idx, val) => {
    const newOpts = [...options];
    newOpts[idx] = val;
    setOptions(newOpts);
  };

  const handleAddQuestion = () => {
    if (!question.trim() || options.some(o => !o.trim())) {
      alert("Заполните вопрос и все варианты ответов");
      return;
    }

    const newQuestion = {
      id: Date.now(),
      question,
      options,
      correctIndex: correctIdx
    };

    const updatedDb = { ...testDb };
    if (!updatedDb[selectedTask]) updatedDb[selectedTask] = { basic: [], advanced: [], expert: [] };
    if (!updatedDb[selectedTask][selectedLevel]) updatedDb[selectedTask][selectedLevel] = [];
    
    updatedDb[selectedTask][selectedLevel].push(newQuestion);
    
    setTestDb(updatedDb);
    api.saveTests(updatedDb);
    
    // Reset form
    setQuestion("");
    setOptions(["", "", "", ""]);
    setCorrectIdx(0);
    alert("Вопрос добавлен!");
  };

  const handleDeleteQuestion = (taskId, level, qId) => {
    if(!confirm("Удалить этот вопрос?")) return;
    const updatedDb = { ...testDb };
    updatedDb[taskId][level] = updatedDb[taskId][level].filter(q => q.id !== qId);
    setTestDb(updatedDb);
    api.saveTests(updatedDb);
  };

  const currentQuestions = testDb[selectedTask]?.[selectedLevel] || [];

  return (
    <div className="animate-fadeIn pb-10">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="text-purple-600" />
          Панель учителя
        </h2>
        <p className="text-gray-500">Добавление и редактирование заданий для тестов</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Controls */}
        <div className="space-y-6">
          <Card>
            <label className="block text-sm font-medium text-gray-700 mb-2">Выберите номер задания</label>
            <select 
              value={selectedTask} 
              onChange={(e) => setSelectedTask(Number(e.target.value))}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:border-purple-500"
            >
              {MOCK_TASKS.map(t => (
                <option key={t.id} value={t.number}>Задание {t.number}: {t.title}</option>
              ))}
            </select>
          </Card>

          <Card>
            <label className="block text-sm font-medium text-gray-700 mb-2">Уровень сложности</label>
            <div className="flex flex-col gap-2">
              {Object.values(LEVELS).map((lvl) => (
                <button
                  key={lvl.id}
                  onClick={() => setSelectedLevel(lvl.id)}
                  className={`p-3 rounded-xl border text-left flex justify-between items-center transition-all ${
                    selectedLevel === lvl.id 
                    ? `border-purple-500 bg-purple-50 text-purple-700 ring-1 ring-purple-500` 
                    : 'border-gray-200 hover:border-purple-300 text-gray-600'
                  }`}
                >
                  <span className="font-medium">{lvl.label}</span>
                  <span className="text-xs bg-white px-2 py-1 rounded border opacity-70">до {lvl.maxScore}%</span>
                </button>
              ))}
            </div>
          </Card>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
            <strong>Всего вопросов:</strong> {currentQuestions.length}<br/>
            Минимум 11 вопросов рекомендуется для разнообразия выборки.
          </div>
        </div>

        {/* MIDDLE COLUMN: Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Plus size={20} className="text-purple-600"/>
              Добавить вопрос
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Текст вопроса</label>
                <textarea 
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 min-h-[100px] outline-none focus:border-purple-500"
                  placeholder="Введите текст задания..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Варианты ответов</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input 
                        type="radio" 
                        name="correct" 
                        checked={correctIdx === idx} 
                        onChange={() => setCorrectIdx(idx)}
                        className="w-4 h-4 text-purple-600 accent-purple-600 cursor-pointer"
                      />
                      <input 
                        type="text" 
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        className={`w-full p-2 rounded-lg border outline-none focus:border-purple-500 ${correctIdx === idx ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                        placeholder={`Вариант ${idx + 1}`}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2 ml-1">* Отметьте точкой правильный вариант</p>
              </div>

              <div className="pt-2">
                <Button onClick={handleAddQuestion} className="w-full">
                  <Save size={18} /> Сохранить вопрос в базу
                </Button>
              </div>
            </div>
          </Card>

          {/* Question List */}
          <div className="space-y-3">
            <h3 className="font-bold text-gray-700">Существующие вопросы ({currentQuestions.length})</h3>
            {currentQuestions.length === 0 ? (
              <div className="text-center p-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed">
                В этой категории пока нет вопросов.
              </div>
            ) : (
              currentQuestions.map((q, idx) => (
                <div key={q.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-start gap-4">
                  <div>
                    <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                    <p className="text-gray-800 font-medium mb-1">{q.question}</p>
                    <div className="text-xs text-gray-500 flex gap-2">
                       <span>Ответ: <span className="text-green-600 font-bold">{q.options[q.correctIndex]}</span></span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteQuestion(selectedTask, selectedLevel, q.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * STUDENT TEST MODAL
 */
const StudentTestModal = ({ task, onClose, onComplete, progress }) => {
  const [stage, setStage] = useState('select_level'); // select_level | testing
  const [level, setLevel] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); // { [idx]: optionIdx }
  const [results, setResults] = useState({}); // { [idx]: boolean }

  // Load questions from DB
  const testDb = api.getTests();
  const currentMastery = progress[task.id] || 0;

  const startTest = (lvlId) => {
    const qs = testDb[task.number]?.[lvlId] || [];
    
    if (qs.length === 0) {
      alert("Учитель еще не загрузил задания для этого уровня.");
      return;
    }

    setQuestions(qs);
    setLevel(lvlId);
    setCurrentIndex(0);
    setUserAnswers({});
    setResults({});
    setStage('testing');
  };

  const handleCheck = () => {
    const currentQuestion = questions[currentIndex];
    const selectedOption = userAnswers[currentIndex];

    if (selectedOption === undefined) return;
    
    const correct = selectedOption === currentQuestion.correctIndex;
    const newResults = { ...results, [currentIndex]: correct };
    setResults(newResults);
    
    // Если ответ верный, обновляем прогресс
    if (correct) {
      const levelConfig = Object.values(LEVELS).find(l => l.id === level);
      if (levelConfig.maxScore > currentMastery) {
        onComplete(task.id, levelConfig.maxScore);
      }
    }
  };

  const selectOption = (optIdx) => {
    // Не даем менять ответ, если уже проверено
    if (results[currentIndex] !== undefined) return;
    setUserAnswers({ ...userAnswers, [currentIndex]: optIdx });
  };

  if (stage === 'select_level') {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Выберите уровень сложности</h2>
            <p className="text-gray-500">Задание №{task.number}: {task.title}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.values(LEVELS).map((lvl) => {
              const isCompleted = currentMastery >= lvl.maxScore;

              return (
                <div 
                  key={lvl.id}
                  onClick={() => startTest(lvl.id)}
                  className={`border-2 rounded-2xl p-5 flex flex-col justify-between cursor-pointer transition-all hover:scale-105 ${isCompleted ? 'border-green-200 bg-green-50 opacity-80' : 'hover:shadow-lg bg-white'} ${lvl.color.replace('bg-', 'border-')}`}
                >
                  <div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${lvl.color}`}>
                      {isCompleted ? <Check size={20} /> : <PlayCircle size={20} />}
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">{lvl.label}</h3>
                    <p className="text-xs text-gray-500">
                      {lvl.id === 'basic' && "Базовые прототипы."}
                      {lvl.id === 'advanced' && "Усложненные условия."}
                      {lvl.id === 'expert' && "Гробы с основной волны."}
                    </p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <span className="text-sm font-bold text-gray-700">до {lvl.maxScore}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'testing' && questions.length > 0) {
    const currentQuestion = questions[currentIndex];
    const isChecked = results[currentIndex] !== undefined;
    const isCorrect = results[currentIndex];
    const selectedOption = userAnswers[currentIndex];

    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative">
          {/* Header & Navigation */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex justify-between items-start">
               <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${LEVELS[level.toUpperCase()].color}`}>
                {LEVELS[level.toUpperCase()].label}
              </span>
              <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
            </div>
            
            {/* Question Navigation Bar */}
            <div className="flex flex-wrap gap-2">
              {questions.map((_, idx) => {
                const status = results[idx]; // true, false or undefined
                let btnClass = "w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";
                
                if (idx === currentIndex) {
                  btnClass += "border-purple-600 ring-2 ring-purple-100 ";
                  if (status === undefined) btnClass += "text-purple-600 bg-white";
                } else {
                  btnClass += "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200 ";
                }

                if (status === true) btnClass = btnClass.replace('bg-gray-100', 'bg-green-100').replace('text-gray-500', 'text-green-600').replace('border-transparent', 'border-green-200');
                if (status === false) btnClass = btnClass.replace('bg-gray-100', 'bg-red-100').replace('text-gray-500', 'text-red-600').replace('border-transparent', 'border-red-200');

                return (
                  <button 
                    key={idx} 
                    onClick={() => setCurrentIndex(idx)}
                    className={btnClass}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-lg font-medium text-gray-900 mb-8">{currentQuestion.question}</p>

          <div className="space-y-3 mb-8">
            {currentQuestion.options.map((opt, idx) => {
              let style = "border-gray-200 hover:border-purple-300";
              
              if (isChecked) {
                if (idx === currentQuestion.correctIndex) style = "border-green-500 bg-green-50 text-green-700 font-medium";
                else if (idx === selectedOption) style = "border-red-500 bg-red-50 text-red-700";
                else style = "border-gray-100 text-gray-400 opacity-50";
              } else if (selectedOption === idx) {
                style = "border-purple-600 bg-purple-50 ring-1 ring-purple-600 text-purple-900";
              }

              return (
                <div 
                  key={idx}
                  onClick={() => selectOption(idx)}
                  className={`p-4 border rounded-xl cursor-pointer transition-all flex justify-between items-center ${style}`}
                >
                  {opt}
                  {isChecked && idx === currentQuestion.correctIndex && <Check size={18}/>}
                  {isChecked && idx === selectedOption && idx !== currentQuestion.correctIndex && <XCircle size={18}/>}
                </div>
              );
            })}
          </div>

          <Button 
            onClick={isChecked ? onClose : handleCheck} 
            disabled={selectedOption === undefined} 
            className="w-full"
            variant={isChecked ? (isCorrect ? 'success' : 'danger') : 'primary'}
          >
            {!isChecked ? 'Проверить' : (isCorrect ? 'Верно! Выбрать другой вопрос' : 'Ошибка. Попробовать другое')}
          </Button>
          
          {isChecked && (
            <button 
              onClick={() => {
                 if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1);
                 else onClose();
              }} 
              className="w-full mt-3 text-gray-400 text-sm hover:text-gray-600 py-2"
            >
              {currentIndex < questions.length - 1 ? 'Следующий вопрос →' : 'Завершить тест'}
            </button>
          )}
        </div>
      </div>
    );
  }
  
  return null;
};

/**
 * PAGE COMPONENTS (Updated Login & Progress)
 */

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const user = await api.login(email, code);
      onLogin(user);
    } catch (err) { setError(err); } 
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><CheckCircle size={32} /></div>
          <h1 className="text-2xl font-bold text-gray-900">Иван на сотку</h1>
          <p className="text-gray-500 mt-2">Вход в платформу</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="Email" className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"/>
          <input type="password" value={code} onChange={e => setCode(e.target.value)} required placeholder="Код доступа (1234 или admin100)" className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"/>
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          <Button type="submit" className="w-full py-3" disabled={loading}>{loading ? 'Вход...' : 'Войти'}</Button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-4">Ученик: 1234 | Учитель: admin100</p>
      </div>
    </div>
  );
};

const ProgressSection = ({ progress, onUpdateProgress, role }) => {
  const [tasks, setTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);

  useEffect(() => { api.getProgress().then(setTasks); }, []);

  const totalMastery = Math.round((Object.values(progress).filter(v => v >= 100).length / MOCK_TASKS.length) * 100);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Успеваемость</h2>
          <p className="text-gray-500">Решай задачи разных уровней, чтобы заполнить шкалу</p>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl border shadow-sm">
          <span className="text-sm text-gray-500 mr-2">Общий зачет:</span>
          <span className="text-xl font-bold text-purple-600">{totalMastery}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tasks.map((task) => {
          const val = progress[task.id] || 0;
          return (
            <Card key={task.id} className="group relative" onClick={() => setActiveTask(task)}>
              <div className="flex justify-between mb-2">
                <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs font-bold">№{task.number}</span>
                <span className="font-bold text-gray-700">{val}%</span>
              </div>
              <h3 className="font-bold text-gray-800 truncate">{task.title}</h3>
              <ProgressBar value={val} />
              
              <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl cursor-pointer backdrop-blur-[2px]">
                <div className="flex items-center gap-2 text-purple-600 font-bold bg-white px-4 py-2 rounded-full shadow-lg border border-purple-100">
                  <PlayCircle size={20} /> Решать
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {activeTask && (
        <StudentTestModal 
          task={activeTask} 
          onClose={() => setActiveTask(null)}
          progress={progress}
          onComplete={(taskId, score) => {
            onUpdateProgress(taskId, score);
            // setActiveTask(null); // Убрали закрытие, чтобы можно было решать дальше
          }}
        />
      )}
    </div>
  );
};

const NotesSection = () => {
  const [currentTask, setCurrentTask] = useState(null);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [files, setFiles] = useState(INITIAL_FILES);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef(null);

  const taskNumbers = Array.from({length: 27}, (_,i) => i+1);

  const handleUpload = async (e) => {
    const f = e.target.files[0];
    if(!f) return;
    setIsUploading(true);
    try {
      const newF = await api.uploadFile(f, currentTask, currentCategory);
      setFiles([newF, ...files]);
    } catch(err) { alert(err); }
    setIsUploading(false);
  };

  if (!currentTask) return (
    <div className="animate-fadeIn">
      <h2 className="text-2xl font-bold mb-6">Конспекты</h2>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
        {taskNumbers.map(n => (
          <Card key={n} onClick={() => setCurrentTask(n)} className="flex flex-col items-center justify-center p-6 hover:bg-purple-50 cursor-pointer">
            <Folder size={32} className="text-blue-400 mb-2 fill-current" />
            <span className="font-bold text-gray-700">Задание {n}</span>
          </Card>
        ))}
      </div>
    </div>
  );

  if (!currentCategory) return (
    <div className="animate-fadeIn">
      <button onClick={() => setCurrentTask(null)} className="flex items-center text-gray-500 mb-4 hover:text-purple-600"><ArrowLeft size={16}/> Назад</button>
      <h2 className="text-2xl font-bold mb-6">Задание {currentTask}</h2>
      <div className="grid grid-cols-2 gap-6">
        <Card onClick={() => setCurrentCategory('class')} className="p-8 flex items-center gap-4 cursor-pointer hover:border-purple-300">
          <BookOpen size={32} className="text-orange-500"/>
          <div><h3 className="font-bold text-lg">На уроке</h3><p className="text-gray-500 text-sm">Презентации и скрипты</p></div>
        </Card>
        <Card onClick={() => setCurrentCategory('home')} className="p-8 flex items-center gap-4 cursor-pointer hover:border-purple-300">
          <FileText size={32} className="text-green-500"/>
          <div><h3 className="font-bold text-lg">Домашка</h3><p className="text-gray-500 text-sm">Файлы заданий</p></div>
        </Card>
      </div>
    </div>
  );

  const filtered = files.filter(f => f.taskNumber === currentTask && f.category === currentCategory);

  return (
    <div className="animate-fadeIn">
      <button onClick={() => setCurrentCategory(null)} className="flex items-center text-gray-500 mb-4 hover:text-purple-600"><ArrowLeft size={16}/> Назад</button>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Файлы: {currentCategory === 'class' ? 'На уроке' : 'Домашка'}</h2>
        <div className="flex gap-2">
          <input type="file" ref={fileRef} className="hidden" onChange={handleUpload}/>
          <Button onClick={() => fileRef.current.click()} disabled={isUploading}><Upload size={18}/> {isUploading ? '...' : 'Загрузить'}</Button>
        </div>
      </div>
      {filtered.length === 0 ? <div className="text-center p-10 bg-white border border-dashed rounded-2xl text-gray-400">Пусто</div> : (
        <div className="space-y-2">
          {filtered.map(f => (
            <div key={f.id} className="bg-white p-4 rounded-xl border flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg"><FileText size={20} className="text-gray-600"/></div>
                <div><p className="font-medium text-gray-800">{f.name}</p><p className="text-xs text-gray-500">{f.size} • {f.date}</p></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => alert('Download ' + f.name)} className="p-2 hover:bg-gray-100 rounded text-gray-500"><Download size={18}/></button>
                <button onClick={() => setFiles(files.filter(x => x.id !== f.id))} className="p-2 hover:bg-red-50 rounded text-red-500"><Trash2 size={18}/></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DashboardLayout = ({ user, onLogout, progress, onUpdateProgress }) => {
  const [view, setView] = useState(user.role === 'teacher' ? 'teacher' : 'progress');
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = user.role === 'teacher' 
    ? [{ id: 'teacher', label: 'Управление тестами', icon: Settings }, { id: 'notes', label: 'Файлы', icon: Folder }]
    : [{ id: 'progress', label: 'Успеваемость', icon: BarChart2 }, { id: 'notes', label: 'Конспекты', icon: BookOpen }];

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <aside className={`fixed md:sticky md:top-0 z-40 bg-white w-64 h-screen border-r transition-transform flex flex-col ${menuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b flex items-center gap-2 font-bold text-xl text-purple-600 shrink-0">
          <CheckCircle className="fill-purple-600 text-white"/> Иван на сотку
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {nav.map(n => (
            <button key={n.id} onClick={() => { setView(n.id); setMenuOpen(false); }} className={`w-full flex items-center gap-3 p-3 rounded-xl font-medium ${view === n.id ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'}`}>
              <n.icon size={20}/> {n.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t bg-white shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-700">{user.name[0]}</div>
            <div className="overflow-hidden">
              <p className="font-bold text-sm truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.role === 'teacher' ? 'Преподаватель' : 'Ученик'}</p>
            </div>
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 text-red-500 hover:text-red-600 text-sm font-medium"><LogOut size={16}/> Выйти</button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden bg-white border-b p-4 flex justify-between items-center">
          <span className="font-bold text-purple-600">Иван на сотку</span>
          <button onClick={() => setMenuOpen(!menuOpen)}><Menu/></button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {view === 'progress' && <ProgressSection progress={progress} onUpdateProgress={onUpdateProgress} role={user.role} />}
          {view === 'notes' && <NotesSection />}
          {view === 'teacher' && <TeacherPanel />}
        </main>
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState({});

  useEffect(() => {
    const savedUser = localStorage.getItem('ege_user_session');
    if (savedUser) setUser(JSON.parse(savedUser));
    const savedProg = localStorage.getItem('ege_user_progress');
    if (savedProg) setProgress(JSON.parse(savedProg));
  }, []);

  const handleLogin = (u) => {
    setUser(u);
    localStorage.setItem('ege_user_session', JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('ege_user_session');
  };

  const updateProgress = (taskId, val) => {
    const newP = { ...progress, [taskId]: val };
    setProgress(newP);
    localStorage.setItem('ege_user_progress', JSON.stringify(newP));
  };

  if (!user) return <LoginPage onLogin={handleLogin} />;
  return (
    <>
      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } } .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }`}</style>
      <DashboardLayout user={user} onLogout={handleLogout} progress={progress} onUpdateProgress={updateProgress} />
    </>
  );
};

export default App;