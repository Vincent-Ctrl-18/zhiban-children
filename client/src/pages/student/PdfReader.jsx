import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, InputNumber, Progress, Spin, Tooltip, Typography, message } from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  CheckOutlined,
  ColumnWidthOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { coursesApi } from '../../services/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const { Text } = Typography;

function safeFilename(value) {
  return String(value || '电子书.pdf').replace(/[\\/:*?"<>|]/g, '_');
}

function PdfReader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const [course, setCourse] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [downloadLoading, setDownloadLoading] = useState(false);

  const saveProgress = useCallback((pageNumber, pages) => {
    if (!pages) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await coursesApi.updateProgress(id, {
          lastPage: pageNumber,
          totalPages: pages,
          progressPercent: Math.round((pageNumber / pages) * 10000) / 100,
        });
      } catch {
        // 翻页不应被短暂的网络故障打断，下一次翻页会再次保存。
      }
    }, 500);
  }, [id]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [resource, progressRows] = await Promise.all([coursesApi.getById(id), coursesApi.getProgress()]);
        if (cancelled) return;
        if (resource.resource_kind !== 'ebook') throw new Error('这不是可阅读的电子书');
        setCourse(resource);
        const progress = (progressRows || []).find((row) => String(row.course_id) === String(id));
        const savedPage = Math.max(1, Number(progress?.last_page || 1));
        await coursesApi.start(id);
        const token = localStorage.getItem('token');
        const response = await fetch(coursesApi.contentUrl(id), { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('电子书暂时无法打开');
        const buffer = await response.arrayBuffer();
        const loadedPdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelled) return;
        setPdf(loadedPdf);
        setTotalPages(loadedPdf.numPages);
        setPage(Math.min(savedPage, loadedPdf.numPages));
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || '电子书加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return undefined;
    let cancelled = false;
    setRendering(true);
    pdf.getPage(page).then(async (pdfPage) => {
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pdfPage.render({ canvasContext: context, viewport }).promise;
      if (!cancelled) {
        setRendering(false);
        saveProgress(page, totalPages);
      }
    }).catch(() => {
      if (!cancelled) {
        setRendering(false);
        setError('当前页面渲染失败，请重试');
      }
    });
    return () => { cancelled = true; };
  }, [pdf, page, scale, saveProgress, totalPages]);

  const goToPage = (nextPage) => {
    if (!totalPages) return;
    setPage(Math.min(totalPages, Math.max(1, nextPage)));
  };

  const handleDownload = async () => {
    setDownloadLoading(true);
    try {
      const response = await coursesApi.download(id);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = safeFilename(course?.file_name || `${course?.title || '电子书'}.pdf`);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      message.success('下载已开始');
    } catch (downloadError) { message.error(downloadError.message || '下载失败'); }
    finally { setDownloadLoading(false); }
  };

  const markComplete = async () => {
    try {
      await coursesApi.complete(id);
      message.success('已标记为读完');
    } catch (completeError) { message.error(completeError.message || '操作失败'); }
  };

  const toggleFullscreen = () => {
    if (containerRef.current?.requestFullscreen) containerRef.current.requestFullscreen();
  };

  const fitToWidth = async () => {
    if (!pdf || !containerRef.current) return;
    try {
      const currentPage = await pdf.getPage(page);
      const naturalViewport = currentPage.getViewport({ scale: 1 });
      const availableWidth = Math.max(280, containerRef.current.clientWidth - 48);
      setScale(Math.min(2.5, Math.max(0.7, availableWidth / naturalViewport.width)));
    } catch { message.error('无法调整阅读宽度'); }
  };

  if (loading) return <div className="pdf-reader-state"><Spin size="large" /><Text type="secondary">正在打开电子书…</Text></div>;
  if (error) return <div className="pdf-reader-state"><Alert type="error" message={error} showIcon /><Button onClick={() => navigate('/student/courses')}>返回学习资源</Button></div>;

  const progress = totalPages ? Math.round((page / totalPages) * 100) : 0;
  return (
    <div className="pdf-reader" ref={containerRef}>
      <header className="pdf-reader-header">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/student/courses')}>返回</Button>
        <div className="pdf-reader-title">
          <Text strong>{course?.title}</Text>
          <Text type="secondary">{course?.author || '电子书'} · 第 {page}/{totalPages} 页</Text>
        </div>
        <div className="pdf-reader-header-actions">
          {course?.allow_download && <Button icon={<DownloadOutlined />} loading={downloadLoading} onClick={handleDownload}>下载</Button>}
          <Tooltip title="全屏"><Button aria-label="全屏阅读" icon={<FullscreenOutlined />} onClick={toggleFullscreen} /></Tooltip>
        </div>
      </header>

      <div className="pdf-reader-progress"><Progress percent={progress} showInfo={false} strokeColor="#FF9F43" /><span>{progress}%</span></div>

      <main className="pdf-reader-stage">
        <div className="pdf-reader-canvas-wrap">
          <canvas ref={canvasRef} aria-label={`${course?.title} 第 ${page} 页`} />
          {rendering && <div className="pdf-reader-rendering"><Spin /></div>}
        </div>
      </main>

      <footer className="pdf-reader-toolbar">
        <Button icon={<LeftOutlined />} disabled={page <= 1} onClick={() => goToPage(page - 1)}>上一页</Button>
        <div className="pdf-reader-page-jump"><InputNumber min={1} max={totalPages} value={page} onChange={(value) => goToPage(Number(value) || 1)} /> <span>/ {totalPages}</span></div>
        <Button icon={<RightOutlined />} iconPosition="end" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>下一页</Button>
        <div className="pdf-reader-zoom">
          <Tooltip title="缩小"><Button aria-label="缩小" icon={<ZoomOutOutlined />} onClick={() => setScale((value) => Math.max(0.7, Number((value - 0.1).toFixed(2))))} /></Tooltip>
          <Text>{Math.round(scale * 100)}%</Text>
          <Tooltip title="放大"><Button aria-label="放大" icon={<ZoomInOutlined />} onClick={() => setScale((value) => Math.min(2.5, Number((value + 0.1).toFixed(2))))} /></Tooltip>
          <Tooltip title="适合宽度"><Button aria-label="适合宽度" icon={<ColumnWidthOutlined />} onClick={fitToWidth} /></Tooltip>
        </div>
        {progress >= 90 && <Button type="primary" icon={<CheckOutlined />} onClick={markComplete}>标记读完</Button>}
      </footer>
    </div>
  );
}

export default PdfReader;
