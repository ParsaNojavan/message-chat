import { RtcType } from '@app/contracts/models/enums/rtc-type';
import { ActiveCall } from '@app/contracts/utils/web_rtc/activeCall';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RtcService {
    constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis,) { }

    private getCallKey(callId: string): string {
        return `rtc:call:${callId}`;
    }

    private getUserCallKey(userId: string): string {
        return `rtc:user-call:${userId}`;
    }

    async isUserBusy(userId: string): Promise<boolean> {
        const exists = await this.redis.exists(this.getUserCallKey(userId));
        return exists === 1;
    }

    async createCall(callerId: string, calleeId: string, type: RtcType): Promise<ActiveCall> {
        if (callerId === calleeId) {
            throw new BadRequestException('You cannot call yourself.');
        }

        const [callerBusy, calleeBusy] = await Promise.all([
            this.isUserBusy(callerId),
            this.isUserBusy(calleeId)
        ]);

        if (callerBusy) {
            throw new BadRequestException('You are already in an active call.');
        }
        if (calleeBusy) {
            throw new BadRequestException('The destination user is currently busy.');
        }
        const callId = `call_${callerId}_${calleeId}_${Date.now()}`;

        const call: ActiveCall = {
            callId,
            callerId,
            calleeId,
            type,
            status: 'dialing'
        }

        const callKey = this.getCallKey(callId);
        const callerUserKey = this.getUserCallKey(callerId);
        const calleeUserKey = this.getUserCallKey(calleeId);

        const pipeline = this.redis.multi();
        pipeline.set(callKey, JSON.stringify(call), 'EX', 60);
        pipeline.set(callerUserKey, callId, 'EX', 60);
        pipeline.set(calleeUserKey, callId, 'EX', 60);

        await pipeline.exec();

        return call;
    }

    async getCallById(callId: string): Promise<ActiveCall | null> {
        const data = await this.redis.get(this.getCallKey(callId));
        if (!data) return null;
        return JSON.parse(data) as ActiveCall;
    }

    async getCallByUserId(userId: string): Promise<ActiveCall | null> {
        const callId = await this.redis.get(this.getUserCallKey(userId));
        if (!callId) return null;
        return this.getCallById(callId);
    }

    async acceptCall(callId: string, calleeId: string): Promise<ActiveCall> {
        const call = await this.getCallById(callId);

        if (!call) throw new NotFoundException('Call session not found or expired.');
        if (call?.calleeId !== calleeId) throw new BadRequestException('You are not authorized to accept this call.');
        if (call.status !== 'dialing') throw new BadRequestException('Call is not in dialing state.');

        call.status = 'connected';

        const callKey = this.getCallKey(callId);
        const callerUserKey = this.getUserCallKey(call.callerId);
        const calleeUserKey = this.getUserCallKey(call.calleeId);

        const pipeline = this.redis.multi();
        pipeline.set(callKey, JSON.stringify(call));
        pipeline.persist(callerUserKey);
        pipeline.persist(calleeUserKey);

        await pipeline.exec();

        return call;
    }

    async endCall(userId: string): Promise<{ call: ActiveCall; peerId: string } | null> {
        const callId = await this.redis.get(this.getUserCallKey(userId));
        if (!callId) return null;

        const call = await this.getCallById(callId);
        if (!call) {
            await this.redis.del(this.getUserCallKey(userId));
            return null;
        }

        const peerId = call.callerId === userId ? call.calleeId : call.callerId;

        const callKey = this.getCallKey(callId);
        const callerUserKey = this.getUserCallKey(call.callerId);
        const calleeUserKey = this.getUserCallKey(call.calleeId);

        await this.redis.del(callKey, callerUserKey, calleeUserKey);

        return { call, peerId };
    }

    async handleUserDisconnect(userId: string): Promise<{ call: ActiveCall; peerId: string } | null> {
        return this.endCall(userId);
    }
}
