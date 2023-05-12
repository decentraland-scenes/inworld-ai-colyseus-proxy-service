export interface ClientUserData{
  dclUserData:UserData
  //other
}

type WearableId = string;

export type AvatarForUserData = {
    bodyShape?: WearableId;
    //skinColor: ColorString
    //hairColor: ColorString
    //eyeColor: ColorString
    wearables: WearableId[];
    //snapshots: Snapshots
};

export type WearablesByOwnerItemData = {
    urn: string;
    amount: number;
};
export type WearablesByOwnerData = WearablesByOwnerItemData[];

export type UserDataList = {
    avatars: UserData[];
};

export type UserData = {
    displayName?: string;
    publicKey: string | null;
    hasConnectedWeb3?: boolean;
    userId?: string;
    version?: number;
    avatar: AvatarForUserData;
};