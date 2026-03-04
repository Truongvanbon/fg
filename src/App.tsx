import React, { useState, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  Settings2, 
  Trash2, 
  Plus, 
  Download, 
  Maximize2, 
  Crop, 
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { AspectRatio, ASPECT_RATIOS, LogoMask, CustomLogo } from './types';

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('original');
  const [mask, setMask] = useState<LogoMask | null>(null);
  const [customLogo, setCustomLogo] = useState<CustomLogo | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const ffmpegRef = useRef(new FFmpeg());
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const loadFFmpeg = async () => {
    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      const ffmpeg = ffmpegRef.current;
      
      ffmpeg.on('log', ({ message }) => {
        console.log(message);
      });
      
      ffmpeg.on('progress', ({ progress }) => {
        setProgress(Math.round(progress * 100));
      });

      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      
      setFfmpegLoaded(true);
    } catch (err) {
      console.error('Failed to load FFmpeg:', err);
      setError('Không thể tải bộ xử lý video. Vui lòng kiểm tra kết nối internet.');
    }
  };

  const onDropVideo = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setOutputUrl(null);
      setMask(null);
    }
  };

  const onDropLogo = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setLogoFile(file);
      const url = URL.createObjectURL(file);
      setLogoUrl(url);
      setCustomLogo({
        url,
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        opacity: 1
      });
    }
  };

  const { getRootProps: getVideoRootProps, getInputProps: getVideoInputProps, isDragActive: isVideoDragActive } = useDropzone({
    onDrop: onDropVideo,
    accept: { 'video/*': [] },
    multiple: false
  });

  const { getRootProps: getLogoRootProps, getInputProps: getLogoInputProps } = useDropzone({
    onDrop: onDropLogo,
    accept: { 'image/*': [] },
    multiple: false
  });

  const handleAddMask = () => {
    if (!videoRef.current) return;
    const { offsetWidth, offsetHeight } = videoRef.current;
    setMask({
      x: offsetWidth * 0.1,
      y: offsetHeight * 0.1,
      width: 100,
      height: 50
    });
  };

  const processVideo = async () => {
    if (!videoFile || !ffmpegLoaded) return;
    
    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const ffmpeg = ffmpegRef.current;
      const inputName = 'input.mp4';
      const outputName = 'output.mp4';
      const logoName = 'logo.png';

      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      let filterChain = '';
      const filters: string[] = [];

      // 1. Logo Removal (Delogo)
      if (mask && videoRef.current) {
        const video = videoRef.current;
        const scaleX = video.videoWidth / video.offsetWidth;
        const scaleY = video.videoHeight / video.offsetHeight;
        
        const x = Math.round(mask.x * scaleX);
        const y = Math.round(mask.y * scaleY);
        const w = Math.round(mask.width * scaleX);
        const h = Math.round(mask.height * scaleY);
        
        filters.push(`delogo=x=${x}:y=${y}:w=${w}:h=${h}`);
      }

      // 2. Aspect Ratio / Resize
      if (aspectRatio !== 'original') {
        const ratio = ASPECT_RATIOS[aspectRatio]!;
        filters.push(`scale='if(gt(a,${ratio}),-1,iw)':'if(gt(a,${ratio}),ih,-1)',pad=w='iw*max(1,${ratio}/a)':h='ih*max(1,a/${ratio})':x='(ow-iw)/2':y='(oh-ih)/2':color=black`);
      }

      // 3. Add Custom Logo
      if (customLogo && logoFile && videoRef.current) {
        await ffmpeg.writeFile(logoName, await fetchFile(logoFile));
        const video = videoRef.current;
        const scaleX = video.videoWidth / video.offsetWidth;
        const scaleY = video.videoHeight / video.offsetHeight;

        const lx = Math.round(customLogo.x * scaleX);
        const ly = Math.round(customLogo.y * scaleY);
        const lw = Math.round(customLogo.width * scaleX);
        const lh = Math.round(customLogo.height * scaleY);

        filterChain = filters.length > 0 ? filters.join(',') + '[v];' : '';
        const logoScale = `[1:v]scale=${lw}:${lh}[logo];`;
        const overlay = `${filterChain ? '[v]' : '[0:v]'}[logo]overlay=${lx}:${ly}`;
        
        await ffmpeg.exec([
          '-i', inputName,
          '-i', logoName,
          '-filter_complex', `${logoScale}${overlay}`,
          '-c:a', 'copy',
          outputName
        ]);
      } else {
        if (filters.length > 0) {
          await ffmpeg.exec([
            '-i', inputName,
            '-vf', filters.join(','),
            '-c:a', 'copy',
            outputName
          ]);
        } else {
          await ffmpeg.exec(['-i', inputName, '-c', 'copy', outputName]);
        }
      }

      const data = await ffmpeg.readFile(outputName);
      const url = URL.createObjectURL(new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' }));
      setOutputUrl(url);
    } catch (err) {
      console.error('Processing error:', err);
      setError('Đã xảy ra lỗi trong quá trình xử lý video.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col font-sans text-zinc-100">
      {/* Header */}
      <header className="h-16 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Settings2 className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-white">VideoCraft Tools</h1>
        </div>
        <div className="flex items-center gap-4">
          {!ffmpegLoaded && !error && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Đang tải bộ xử lý...
            </div>
          )}
          {ffmpegLoaded && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Hệ thống sẵn sàng
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Left Sidebar: Controls */}
        <aside className="lg:col-span-3 border-r border-zinc-800 bg-zinc-900 overflow-y-auto p-6 space-y-8">
          {/* Aspect Ratio */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Định dạng & Kích thước</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(ASPECT_RATIOS) as AspectRatio[]).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={cn(
                    "px-3 py-2 text-sm rounded-md border transition-all",
                    aspectRatio === ratio 
                      ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400 font-medium" 
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/50"
                  )}
                >
                  {ratio === 'original' ? 'Gốc' : ratio}
                </button>
              ))}
            </div>
          </section>

          {/* Logo Removal */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Crop className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Xóa Logo</h2>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Chọn vùng trên video để làm mờ hoặc xóa các watermark hiện có.
            </p>
            <button
              onClick={handleAddMask}
              disabled={!videoUrl}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-semibold hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              Thêm vùng xóa
            </button>
            {mask && (
              <button
                onClick={() => setMask(null)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Xóa vùng chọn
              </button>
            )}
          </section>

          {/* Add Logo */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Thêm Logo mới</h2>
            </div>
            <div {...getLogoRootProps()} className="border-2 border-dashed border-zinc-800 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors">
              <input {...getLogoInputProps()} />
              <Plus className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
              <p className="text-xs text-zinc-500 font-medium">Tải lên Logo PNG/JPG</p>
            </div>
            {customLogo && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Độ mờ</span>
                  <span>{Math.round(customLogo.opacity * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.1" 
                  value={customLogo.opacity}
                  onChange={(e) => setCustomLogo({...customLogo, opacity: parseFloat(e.target.value)})}
                  className="w-full accent-indigo-500"
                />
                <button
                  onClick={() => {
                    setCustomLogo(null);
                    setLogoFile(null);
                    setLogoUrl(null);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-zinc-800 text-zinc-400 rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Gỡ Logo mới
                </button>
              </div>
            )}
          </section>

          {/* Action Button */}
          <div className="pt-4">
            <button
              onClick={processVideo}
              disabled={!videoFile || isProcessing || !ffmpegLoaded}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-semibold shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-3"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang xử lý {progress}%
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Xuất Video
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Center: Preview Area */}
        <div className="lg:col-span-9 bg-zinc-950 flex flex-col">
          <div className="flex-1 p-8 flex items-center justify-center overflow-hidden">
            {!videoUrl ? (
              <div 
                {...getVideoRootProps()} 
                className={cn(
                  "w-full max-w-2xl aspect-video border-4 border-dashed rounded-3xl flex flex-col items-center justify-center gap-4 transition-all cursor-pointer",
                  isVideoDragActive ? "border-indigo-500 bg-indigo-500/5" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                )}
              >
                <input {...getVideoInputProps()} />
                <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center">
                  <Upload className="w-8 h-8 text-zinc-500" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-white">Tải video lên</p>
                  <p className="text-sm text-zinc-500">Kéo thả hoặc nhấp để chọn tệp</p>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                <div 
                  ref={containerRef}
                  className="video-container shadow-2xl shadow-black/50 max-w-full max-h-full border border-zinc-800"
                  style={{ 
                    aspectRatio: aspectRatio !== 'original' ? ASPECT_RATIOS[aspectRatio]! : 'auto'
                  }}
                >
                  <video 
                    ref={videoRef}
                    src={videoUrl} 
                    className="max-w-full max-h-[70vh] block"
                    controls
                  />
                  
                  {/* Mask Overlay */}
                  {mask && (
                    <motion.div 
                      drag
                      dragMomentum={false}
                      dragConstraints={containerRef}
                      onDrag={(e, info) => {
                        setMask({ ...mask, x: mask.x + info.delta.x, y: mask.y + info.delta.y });
                      }}
                      className="mask-overlay"
                      style={{
                        left: mask.x,
                        top: mask.y,
                        width: mask.width,
                        height: mask.height
                      }}
                    >
                      <div className="absolute -top-6 left-0 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
                        Vùng xóa
                      </div>
                    </motion.div>
                  )}

                  {/* Custom Logo Overlay */}
                  {customLogo && (
                    <motion.div
                      drag
                      dragMomentum={false}
                      dragConstraints={containerRef}
                      onDrag={(e, info) => {
                        setCustomLogo({ ...customLogo, x: customLogo.x + info.delta.x, y: customLogo.y + info.delta.y });
                      }}
                      className="logo-overlay"
                      style={{
                        left: customLogo.x,
                        top: customLogo.y,
                        width: customLogo.width,
                        height: customLogo.height,
                        opacity: customLogo.opacity
                      }}
                    >
                      <img 
                        src={customLogo.url} 
                        alt="Logo" 
                        className="w-full h-full object-contain pointer-events-none"
                        referrerPolicy="no-referrer"
                      />
                    </motion.div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Bar: Status/Output */}
          <AnimatePresence>
            {(outputUrl || error) && (
              <motion.div 
                initial={{ y: 100 }}
                animate={{ y: 0 }}
                exit={{ y: 100 }}
                className="h-24 bg-zinc-900 border-t border-zinc-800 px-8 flex items-center justify-between"
              >
                {outputUrl ? (
                  <>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Xử lý hoàn tất!</p>
                        <p className="text-xs text-zinc-500">Video của bạn đã sẵn sàng để tải về.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setOutputUrl(null)}
                        className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
                      >
                        Đóng
                      </button>
                      <a 
                        href={outputUrl} 
                        download="video-da-xu-ly.mp4"
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
                      >
                        <Download className="w-4 h-4" />
                        Tải xuống MP4
                      </a>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-red-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Đã xảy ra lỗi</p>
                        <p className="text-xs text-zinc-500">{error}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setError(null)}
                      className="p-2 hover:bg-zinc-800 rounded-full"
                    >
                      <X className="w-5 h-5 text-zinc-500" />
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
