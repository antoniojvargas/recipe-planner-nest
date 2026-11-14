import { Types } from 'mongoose';
import type { Household, HouseholdMember } from '../../src/households/household.schema.js';
import type { CreateHouseholdInput } from '../../src/households/households.repository.js';

type StoredHousehold = Household & { _id: Types.ObjectId; inviteCodeExpiresAt?: Date };

/** Repositorio de hogares en memoria para pruebas de integración/e2e. */
export class InMemoryHouseholdsRepository {
  readonly households: StoredHousehold[] = [];

  create(input: CreateHouseholdInput): Promise<unknown> {
    const household = {
      _id: new Types.ObjectId(),
      name: input.name,
      members: (input.members ?? []).map((member) => ({
        userId: member.userId,
        role: member.role,
        joinedAt: member.joinedAt,
      })),
      inviteCodeHash: input.inviteCodeHash,
      inviteCodeExpiresAt: input.inviteCodeExpiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as StoredHousehold;
    this.households.push(household);

    return Promise.resolve(household);
  }

  findById(householdId: string): Promise<Household | null> {
    const household = this.households.find((item) => item._id.toString() === householdId);

    return Promise.resolve(household ?? null);
  }

  findByMember(userId: string): Promise<Household[]> {
    return Promise.resolve(
      this.households.filter((household) =>
        household.members.some((member: HouseholdMember) => member.userId.toString() === userId),
      ),
    );
  }

  findByInviteCodeHash(inviteCodeHash: string): Promise<Household | null> {
    const household = this.households.find((item) => item.inviteCodeHash === inviteCodeHash);

    return Promise.resolve(household ?? null);
  }

  addMember(householdId: string, member: HouseholdMember): Promise<Household | null> {
    const household = this.households.find((item) => item._id.toString() === householdId);

    if (household === undefined) {
      return Promise.resolve(null);
    }

    household.members.push({
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt,
    });

    return Promise.resolve(household);
  }

  removeMember(householdId: string, userId: string): Promise<Household | null> {
    const household = this.households.find((item) => item._id.toString() === householdId);

    if (household === undefined) {
      return Promise.resolve(null);
    }

    household.members = household.members.filter(
      (member: HouseholdMember) => member.userId.toString() !== userId,
    );

    return Promise.resolve(household);
  }

  setInviteCode(
    householdId: string,
    inviteCodeHash: string,
    inviteCodeExpiresAt: Date,
  ): Promise<Household | null> {
    const household = this.households.find((item) => item._id.toString() === householdId);

    if (household === undefined) {
      return Promise.resolve(null);
    }

    household.inviteCodeHash = inviteCodeHash;
    household.inviteCodeExpiresAt = inviteCodeExpiresAt;

    return Promise.resolve(household);
  }
}
