import Context from '@app/contracts/models/dtos/rpcContext';
import { RoleType } from '@app/contracts/models/enums/role-type';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AccessToken } from 'livekit-server-sdk';
import { Model, Types } from 'mongoose';
import RoomMember from 'src/models/concrete/member';

@Injectable()
export class GroupRtcService {

    private readonly livekitApiKey = process.env.LIVEKIT_API_KEY;
    private readonly livekitApiSecret = process.env.LIVEKIT_API_SECRET;

    constructor(@InjectModel(RoomMember.name) private memberModel: Model<RoomMember>,) { }

    async createToken(roomId: string, context: Context) {

        const userId = context.sub;
        console.log(userId)

        if (!roomId || !userId) {
            throw new UnauthorizedException('Room ID and User ID are required');
        }

        const roomMember = await this.memberModel.findOne({
            roomId: new Types.ObjectId(roomId),
            userId: userId
        });

        console.log(roomMember)
        

        if(!roomMember)
            throw new ForbiddenException('access.denied')

        
        const isAdmin = roomMember.role === RoleType.ADMIN;
        const name = isAdmin ? `Admin-${userId.substring(0, 5)}` : `Member-${userId.substring(0, 5)}`; 

        const at = new AccessToken(this.livekitApiKey, this.livekitApiSecret, {
            identity: userId,
            name: name,
            ttl: '2h'
        });

        at.addGrant({
            roomJoin: true,
            room: roomId,
            canPublish: true,
            canSubscribe: true,
            roomAdmin: isAdmin,
        });

        return {
            "rpcToken": (await at.toJwt()).toString()
        }
    }
}
