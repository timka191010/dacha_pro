import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/Layout/AppLayout';
import { HomePage } from './components/Home/HomePage';
import { CalendarPage } from './components/Calendar/CalendarPage';
import { ShowcasePage } from './components/Showcase/ShowcasePage';
import { ArticlesPage } from './components/Articles/ArticlesPage';
import { AiChatPage } from './components/AiChat/AiChatPage';
import { GardenPage } from './components/Garden/GardenPage';
import { useDisableZoom } from './hooks/useDisableZoom';

export default function App() {
  useDisableZoom();
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="ai" element={<AiChatPage />} />
        <Route path="showcase" element={<ShowcasePage />} />
        <Route path="articles" element={<ArticlesPage />} />
        <Route path="articles/:id" element={<ArticlesPage />} />
        <Route path="garden" element={<GardenPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
