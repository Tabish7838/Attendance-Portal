import { useEffect, type FC } from "react";
import NetInfo from "@react-native-community/netinfo";

import { useAuth } from "../context/AuthContext";
import { syncNow } from "./sync";

const SyncListener: FC = () => {
  const { user, accessToken } = useAuth();

  useEffect(() => {
    if (!user?.id || !accessToken) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        syncNow({ accessToken, teacherId: user.id });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id, accessToken]);

  return null;
};

export default SyncListener;
