import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { practiceArticles } from '../data/practiceArticles';

const filters = ['全部','托管陪伴','课堂助学','调研纪实'];
const visible = (article, filter) => filter === '全部' ||
  (filter === '托管陪伴' && /陪伴|托管|社区|志愿/.test(article.category)) ||
  (filter === '课堂助学' && /课堂|助学|科普/.test(article.category)) ||
  (filter === '调研纪实' && /调研|山乡/.test(article.category));

export default function Practice() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('全部');
  const articles = useMemo(() => practiceArticles.filter(item => visible(item, filter)), [filter]);

  return <main className="practice-editorial">
    <nav className="practice-editorial-nav"><button onClick={() => navigate('/')}><ArrowLeftOutlined /> 返回首页</button><span>智伴乡童 · FIELD NOTES</span></nav>
    <header className="practice-editorial-hero"><div><span>11 CITIES · 11 FIELD NOTES</span><h1>陪伴发生在<br/>一个个具体的地方。</h1></div><p>从社区托管班到山乡小学，记录武汉大学“智伴乡童，暖护童心”实践队的真实行动。每张图片均来自对应的公众号原文。</p></header>
    <section className="practice-mapline" aria-label="实践地点">{practiceArticles.map((article, index) => <span key={article.id}><i />{article.place}<small>{String(index + 1).padStart(2, '0')}</small></span>)}</section>
    <section className="practice-editorial-content">
      <div className="practice-filter" role="tablist">{filters.map((item, index) => <button role="tab" aria-selected={filter === item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}<i style={{ transform: `translateX(${filters.indexOf(filter) * 100}%)` }} /></div>
      <div className="practice-article-list" key={filter}>{articles.map((article, index) => <a href={article.url} target="_blank" rel="noreferrer" className="practice-article-row" style={{ '--row-delay': `${index * 45}ms` }} key={article.id}><span className="practice-article-number">{String(practiceArticles.indexOf(article) + 1).padStart(2, '0')}</span><div className="practice-article-cover"><img src={article.cover} alt="" loading="lazy" /></div><div className="practice-article-location"><strong>{article.place}</strong><small>{article.category} · {article.date}</small></div><div className="practice-article-copy"><h2>{article.title}</h2><p>{article.excerpt}</p></div><span className="practice-article-open">原文 <ArrowUpOutlined /></span></a>)}</div>
    </section>
    <footer className="practice-editorial-footer"><p>FIELD NOTES / 2026</p><h2>每一次抵达，<br/>都应该留下真实记录。</h2><button onClick={() => navigate('/')}>回到首页</button></footer>
  </main>;
}
