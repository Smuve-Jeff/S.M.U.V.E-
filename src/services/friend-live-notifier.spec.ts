jest.mock("./social.service", () => ({
  listFriends: jest.fn(),
  persistNotification: jest.fn(),
}));
jest.mock("@/socket", () => ({
  emitToUser: jest.fn(),
  isUserOnline: jest.fn(),
}));

import { emitToUser, isUserOnline } from "@/socket";
import { listFriends, persistNotification } from "./social.service";
import { notifyFriendsWentLive } from "./friend-live-notifier";

const listFriendsMock = listFriends as jest.Mock;
const persistMock = persistNotification as jest.Mock;
const emitMock = emitToUser as jest.Mock;
const onlineMock = isUserOnline as jest.Mock;

describe("notifyFriendsWentLive", () => {
  beforeEach(() => {
    listFriendsMock.mockReset();
    persistMock.mockReset().mockResolvedValue({});
    emitMock.mockReset();
    onlineMock.mockReset().mockReturnValue(true);
  });

  it("leaves a card in the inbox of a friend who is offline", async () => {
    listFriendsMock.mockResolvedValue([
      { userId: "322", status: "accepted" },
      { userId: "323", status: "accepted" },
    ]);
    onlineMock.mockImplementation((id: string) => id === "322");

    await notifyFriendsWentLive("321", {
      shareToken: "tok_live",
      platform: "smuve",
      gameId: "tekken-3-elite",
      hostDisplayName: "NOVA",
    });

    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toBe("322");
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(persistMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "323",
        type: "friend_live",
        title: "NOVA IS LIVE",
        payload: expect.objectContaining({ shareToken: "tok_live" }),
      }),
    );
  });

  it("still notifies when the inbox write fails", async () => {
    listFriendsMock.mockResolvedValue([{ userId: "324", status: "accepted" }]);
    onlineMock.mockReturnValue(false);
    persistMock.mockRejectedValue(new Error("db down"));

    await expect(
      notifyFriendsWentLive("321", { shareToken: "tok_live" }),
    ).resolves.toBeUndefined();
    expect(persistMock).toHaveBeenCalledTimes(1);
  });

  it("raises a join card on every accepted friend", async () => {
    listFriendsMock.mockResolvedValue([
      { userId: "322", status: "accepted" },
      { userId: "323", status: undefined },
    ]);

    await notifyFriendsWentLive("321", {
      shareToken: "tok_live",
      platform: "smuve",
      gameId: "tekken-3-elite",
      hostDisplayName: "NOVA",
    });

    expect(emitMock).toHaveBeenCalledTimes(2);
    expect(emitMock).toHaveBeenNthCalledWith(
      1,
      "322",
      "friend_went_live",
      expect.objectContaining({
        hostId: "321",
        hostDisplayName: "NOVA",
        platform: "smuve",
        gameId: "tekken-3-elite",
        shareToken: "tok_live",
      }),
    );
    expect(emitMock).toHaveBeenNthCalledWith(
      2,
      "323",
      "friend_went_live",
      expect.objectContaining({ shareToken: "tok_live" }),
    );
  });

  it("does not turn a pending friend request into a broadcast invite", async () => {
    listFriendsMock.mockResolvedValue([
      { userId: "324", status: "pending" },
      { userId: "325", status: "accepted" },
    ]);

    await notifyFriendsWentLive("321", { shareToken: "tok_live" });

    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      "325",
      "friend_went_live",
      expect.anything(),
    );
  });

  it("does nothing without a share token", async () => {
    await notifyFriendsWentLive("321", { shareToken: "" });
    expect(listFriendsMock).not.toHaveBeenCalled();
  });
});
