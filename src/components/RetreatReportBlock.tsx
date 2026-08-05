import type { RetreatResolution } from '../types';

const RETREAT_DC = 10;

function reasonLabel(reason: RetreatResolution['reason']): string {
  if (reason === 'HERO_DOWN') return 'участник отряда потерял боеспособность';
  if (reason === 'HALF_PARTY_WOUNDED') return 'не менее половины отряда тяжело ранено';
  if (reason === 'RETURN_COMPLICATION') return 'провалено осложнение на обратном пути';
  return 'отряд был вынужден прервать операцию';
}

export default function RetreatReportBlock({
  retreat,
  squadAdvIds,
  squadNames
}: {
  retreat: RetreatResolution;
  squadAdvIds: string[];
  squadNames: string[];
}) {
  if (!retreat.wasTriggered) return null;
  const nameById = new Map(squadAdvIds.map((id, index) => [id, squadNames[index] ?? id]));
  const deadNames = retreat.deadAdventurerIds.map(id => nameById.get(id) ?? id);
  const returnedNames = retreat.returnedAdventurerIds.map(id => nameById.get(id) ?? id);
  const success = retreat.isSuccess;

  return (
    <section className={`rounded border p-3 font-mono text-[11px] ${success ? 'border-amber-500/30 bg-amber-950/10' : 'border-rose-500/40 bg-rose-950/15'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className={success ? 'text-amber-300' : 'text-rose-300'}>🏃 Проверка отступления</strong>
        <span className={`rounded border px-2 py-0.5 text-[9px] font-bold uppercase ${success ? 'border-emerald-500/40 text-emerald-400' : 'border-rose-500/50 text-rose-400'}`}>
          {success ? 'Успех' : 'Провал'}
        </span>
      </div>
      <p className="mt-1.5 text-neutral-400">Причина: {reasonLabel(retreat.reason)}.</p>
      {retreat.usedSupplies ? (
        <p className="mt-1 text-emerald-400">Автоуспех: потрачены оставшиеся Припасы.</p>
      ) : (
        <p className="mt-1 text-neutral-300">
          d20({retreat.roll ?? '—'}) + {retreat.bonus} = {retreat.total ?? '—'} против DC {RETREAT_DC}.
        </p>
      )}
      {!success && <p className="mt-1 font-bold text-rose-400">Каждый участник получил 1 дополнительный урон.</p>}
      {deadNames.length > 0 && <p className="mt-1 text-rose-300">Погибли при отступлении: {deadNames.join(', ')}.</p>}
      {returnedNames.length > 0 && <p className="mt-1 text-emerald-300">Смогли вернуться: {returnedNames.join(', ')}.</p>}
      {!success && returnedNames.length === 0 && <p className="mt-1 font-bold text-rose-300">После проваленной попытки отступления никто не вернулся.</p>}
    </section>
  );
}
