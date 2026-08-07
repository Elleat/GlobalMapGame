import { X } from 'lucide-react';

export default function HelpModal({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/85 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-label="Справка">
    <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-emerald-500/30 bg-[#0b0b0b] shadow-2xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-800 bg-[#0b0b0b]/95 p-5"><div><p className="font-mono text-[10px] uppercase tracking-widest text-emerald-500">Глобальная Карта</p><h2 className="text-xl font-bold text-white">Управление и горячие клавиши</h2></div><button type="button" onClick={onClose} className="rounded border border-neutral-700 p-2 text-neutral-400 hover:text-white"><X className="h-4 w-4" /></button></header>
      <div className="grid gap-5 p-5 md:grid-cols-2">
        <HelpSection title="Карта"><KeyLine keys="Колесо" text="масштаб под курсором"/><KeyLine keys="Правая / средняя кнопка" text="перемещение карты"/><KeyLine keys="Левый щелчок" text="действие активного инструмента; в режиме регионов — выбрать область щелчком внутри неё"/><KeyLine keys="Home" text="вписать карту или вернуться к штабу"/><KeyLine keys="+ / −" text="изменить масштаб"/><KeyLine keys="Ctrl+Z" text="отменить последнее изменение геометрии"/><KeyLine keys="Ctrl+Shift+Z / Ctrl+Y" text="повторить отменённое изменение"/><KeyLine keys="Delete" text="удалить выбранную разблокированную вершину"/><KeyLine keys="Esc" text="перейти в безопасный режим выбора и заблокировать геометрию"/><p>Каждый инструмент изменяет только свой слой. Вершины выбранного региона можно двигать лишь после отдельной разблокировки.</p></HelpSection>
        <HelpSection title="Редактор сценария"><KeyLine keys="Ctrl+S" text="скачать текущий файл; для сценария — .globalmap"/><KeyLine keys="Ctrl+F" text="перейти к поиску событий"/><KeyLine keys="Ctrl+D" text="дублировать выбранное событие"/><KeyLine keys="Двойной щелчок" text="открыть событие из графа"/><p>Черновик данных автоматически сохраняется в этом браузере. Пользовательское изображение карты из соображений размера нужно выбрать повторно после восстановления.</p></HelpSection>
        <HelpSection title="Игровой цикл"><p>Кланы разведывают донесения, создают контракты и прикладывают ресурсы. После действий Гильдии запускается симуляция. Раненые отдыхают, события теряют срок, а изменения активности кланов применяются со следующего дня.</p></HelpSection>
        <HelpSection title="Результаты"><p>«Провал задачи» означает, что выжившие вернулись с кратким брифингом. «Отряд не вернулся» скрывает от игроков механику и сведения. ГМ видит полный рапорт и может пересчитать последствия.</p></HelpSection>
        <HelpSection title="События и осложнения"><p>Пустышки не имеют этапов, но могут содержать осложнения в дороге. Возобновляемость скрыта от игроков. Осложнения настраиваются отдельно до миссии и после каждого этапа.</p></HelpSection>
        <HelpSection title="Файлы"><p>JSON содержит редактируемые данные. Формат .globalmap дополнительно включает изображение карты. Скачивание не закрывает редактор и не меняет активную кампанию.</p></HelpSection>
      </div>
    </div>
  </div>;
}

function HelpSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-lg border border-neutral-800 bg-black/35 p-4 text-xs leading-relaxed text-neutral-400"><h3 className="mb-3 font-mono text-xs font-bold uppercase text-emerald-400">{title}</h3><div className="space-y-2">{children}</div></section>; }
function KeyLine({ keys, text }: { keys: string; text: string }) { return <div className="flex items-start gap-3"><kbd className="min-w-28 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-center font-mono text-[10px] text-neutral-200">{keys}</kbd><span>{text}</span></div>; }
