import type {
  Adventurer,
  AdventurerDistributionDecision,
  Contract,
  ContractCandidateDecision,
  DistributionReport
} from '../types';
import {
  canPaymentSupportParty,
  getAdventurerPaymentShare,
  getContractPerceivedValue,
  getRelationBonus
} from './economy';
import { isAvailableNpc } from './adventurers';

export interface DistributionInput {
  adventurers: Adventurer[];
  contracts: Contract[];
  hCost: number;
  random?: () => number;
  generatedAt?: string;
  randomSeed?: string;
}

export interface DistributionResult {
  contracts: Contract[];
  report: DistributionReport;
}

interface PairCandidate {
  adventurer: Adventurer;
  contract: Contract;
  contractIndex: number;
  decision: ContractCandidateDecision;
  relationBonus: number;
  tieBreaker: number;
}

function cloneContractsForPlayerDistribution(
  contracts: Contract[],
  adventurersById: Map<string, Adventurer>
): Contract[] {
  return contracts.map(contract => {
    const retainedParty = (contract.partyAdvIds ?? []).filter(id => {
      const adventurer = adventurersById.get(id);
      return Boolean(adventurer && !adventurer.isArchived);
    });
    return { ...contract, partyAdvIds: retainedParty };
  });
}

function evaluateContract(
  adventurer: Adventurer,
  contract: Contract,
  party: Adventurer[],
  hCost: number
): ContractCandidateDecision {
  const perceivedValue = getContractPerceivedValue(contract, adventurer, hCost);
  const relationBonus = getRelationBonus(adventurer, contract.clanId, hCost);

  if (!contract.confirmed || !contract.clanId || contract.clanId === 'clan_guild') {
    return {
      contractMissionId: contract.missionId,
      eligible: false,
      perceivedValue,
      relationBonus,
      offeredShare: 0,
      reason: 'Контракт недоступен для рыночного найма.'
    };
  }
  if (adventurer.level > contract.contractLevel) {
    return {
      contractMissionId: contract.missionId,
      eligible: false,
      perceivedValue,
      relationBonus,
      offeredShare: 0,
      reason: `Уровень героя ${adventurer.level} превышает ранг контракта ${contract.contractLevel}.`
    };
  }
  if (party.length >= contract.maxPartySize) {
    return {
      contractMissionId: contract.missionId,
      eligible: false,
      perceivedValue,
      relationBonus,
      offeredShare: 0,
      reason: 'Отряд уже заполнен.'
    };
  }

  const proposedParty = [...party, adventurer];
  const offeredShare = getAdventurerPaymentShare(contract.paymentAmount, adventurer, proposedParty);
  if (!canPaymentSupportParty(contract.paymentAmount, proposedParty, hCost)) {
    return {
      contractMissionId: contract.missionId,
      eligible: false,
      perceivedValue,
      relationBonus,
      offeredShare,
      reason: 'Оплаты недостаточно для минимальных ставок итогового отряда.'
    };
  }

  return {
    contractMissionId: contract.missionId,
    eligible: true,
    perceivedValue,
    relationBonus,
    offeredShare
  };
}

function compareCandidates(left: PairCandidate, right: PairCandidate): number {
  if (left.decision.perceivedValue !== right.decision.perceivedValue) {
    return right.decision.perceivedValue - left.decision.perceivedValue;
  }
  if (left.relationBonus !== right.relationBonus) {
    return right.relationBonus - left.relationBonus;
  }
  if (left.contract.paymentAmount !== right.contract.paymentAmount) {
    return right.contract.paymentAmount - left.contract.paymentAmount;
  }
  // If offers are equally attractive, the contractor keeps the stronger
  // eligible candidate and uses the paid level budget more efficiently.
  if (left.adventurer.level !== right.adventurer.level) {
    return right.adventurer.level - left.adventurer.level;
  }

  const leftSize = left.contract.partyAdvIds.length;
  const rightSize = right.contract.partyAdvIds.length;
  if (leftSize !== rightSize) return leftSize - rightSize;
  return left.tieBreaker - right.tieBreaker;
}

export function distributePlayerContracts(input: DistributionInput): DistributionResult {
  const random = input.random ?? Math.random;
  const adventurersById = new Map(input.adventurers.map(adventurer => [adventurer.id, adventurer]));
  const contracts = cloneContractsForPlayerDistribution(input.contracts, adventurersById);
  const initiallyAssignedIds = new Set(contracts.flatMap(contract => contract.partyAdvIds));
  const available = input.adventurers.filter(adventurer =>
    isAvailableNpc(adventurer)
    && !initiallyAssignedIds.has(adventurer.id)
  );

  const remaining = new Map(available.map(adventurer => [adventurer.id, adventurer]));
  const decisions = new Map<string, AdventurerDistributionDecision>();

  while (remaining.size > 0) {
    const candidates: PairCandidate[] = [];

    remaining.forEach(adventurer => {
      contracts.forEach((contract, contractIndex) => {
        const party = contract.partyAdvIds
          .map(id => adventurersById.get(id))
          .filter((member): member is Adventurer => Boolean(member));
        const decision = evaluateContract(adventurer, contract, party, input.hCost);
        if (decision.eligible) {
          candidates.push({
            adventurer,
            contract,
            contractIndex,
            decision,
            relationBonus: decision.relationBonus,
            tieBreaker: random()
          });
        }
      });
    });

    if (candidates.length === 0) break;
    candidates.sort(compareCandidates);
    const selected = candidates[0];

    const candidateDecisions = contracts.map(contract => {
      const party = contract.partyAdvIds
        .map(id => adventurersById.get(id))
        .filter((member): member is Adventurer => Boolean(member));
      return evaluateContract(selected.adventurer, contract, party, input.hCost);
    });

    contracts[selected.contractIndex].partyAdvIds.push(selected.adventurer.id);
    decisions.set(selected.adventurer.id, {
      adventurerId: selected.adventurer.id,
      adventurerName: selected.adventurer.name,
      selectedMissionId: selected.contract.missionId,
      candidates: candidateDecisions
    });
    remaining.delete(selected.adventurer.id);
  }

  remaining.forEach(adventurer => {
    const candidateDecisions = contracts.map(contract => {
      const party = contract.partyAdvIds
        .map(id => adventurersById.get(id))
        .filter((member): member is Adventurer => Boolean(member));
      return evaluateContract(adventurer, contract, party, input.hCost);
    });
    decisions.set(adventurer.id, {
      adventurerId: adventurer.id,
      adventurerName: adventurer.name,
      selectedMissionId: null,
      candidates: candidateDecisions
    });
  });

  const assignedAdventurers = available.length - remaining.size;
  const logs = Array.from(decisions.values()).map(decision => {
    if (!decision.selectedMissionId) {
      return `${decision.adventurerName} остался в резерве: подходящего и достаточно оплачиваемого контракта нет.`;
    }
    const contract = contracts.find(item => item.missionId === decision.selectedMissionId);
    const selectedDecision = decision.candidates.find(item => item.contractMissionId === decision.selectedMissionId);
    return `${decision.adventurerName} выбрал «${contract?.title ?? decision.selectedMissionId}» с личной ценностью ${selectedDecision?.perceivedValue.toFixed(1) ?? '0'}.`;
  });

  return {
    contracts,
    report: {
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      randomSeed: input.randomSeed,
      availableAdventurers: available.length,
      assignedAdventurers,
      unassignedAdventurers: remaining.size,
      decisions: Array.from(decisions.values()),
      logs
    }
  };
}
