/* eslint-disable react-hooks/exhaustive-deps */
import { ApiPromise } from '@polkadot/api';
import { notification } from 'antd';
import keyring from '@polkadot/ui-keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import React, { createContext, Dispatch, useCallback, useContext, useEffect, useReducer, useState } from 'react';
import { LONG_DURATION, NETWORK_CONFIG } from '../config';
import { Action, IAccountMeta, NetConfig, NetworkType } from '../model';
import { ConnectStatus, connectSubstrate, getInfoFromHash, patchUrl } from '../utils';

interface StoreState {
  accounts: IAccountMeta[] | null;
  network: NetworkType;
  networkStatus: ConnectStatus; // FIXME unused now;
}

interface Token {
  symbol: string;
  decimal: string;
}

interface Chain {
  tokens: Token[];
  ss58Format: string;
}

type ActionType = 'switchNetwork' | 'updateNetworkStatus' | 'setAccounts';

const info = getInfoFromHash();

const initialState: StoreState = {
  network: info.network || 'pangolin',
  accounts: null,
  networkStatus: 'pending',
};

// eslint-disable-next-line complexity, @typescript-eslint/no-explicit-any
export function accountReducer(state: StoreState, action: Action<ActionType, any>): StoreState {
  switch (action.type) {
    case 'switchNetwork': {
      return { ...state, network: action.payload as NetworkType };
    }

    case 'setAccounts': {
      return { ...state, accounts: action.payload };
    }

    case 'updateNetworkStatus': {
      return { ...state, networkStatus: action.payload };
    }

    default:
      return state;
  }
}

export type ApiCtx = {
  accounts: IAccountMeta[] | null;
  api: ApiPromise | null;
  createAction: ActionHelper;
  dispatch: Dispatch<Action<ActionType>>;
  network: NetworkType;
  networkStatus: ConnectStatus;
  setAccounts: (accounts: IAccountMeta[]) => void;
  setNetworkStatus: (status: ConnectStatus) => void;
  switchNetwork: (type: NetworkType) => void;
  setApi: (api: ApiPromise) => void;
  networkConfig: NetConfig;
  chain: Chain | null;
};

type ActionHelper = <T = string>(type: ActionType) => (payload: T) => void;

export const ApiContext = createContext<ApiCtx | null>(null);

export const ApiProvider = ({ children }: React.PropsWithChildren<unknown>) => {
  const [state, dispatch] = useReducer(accountReducer, initialState);
  const createAction: ActionHelper = (type) => (payload) => dispatch({ type, payload: payload as never });
  const switchNetwork = useCallback(createAction<NetworkType>('switchNetwork'), []);
  const setAccounts = useCallback(createAction<IAccountMeta[]>('setAccounts'), []);
  const setNetworkStatus = useCallback(createAction<ConnectStatus>('updateNetworkStatus'), []);
  const [api, setApi] = useState<ApiPromise | null>(null);
  const [chain, setChain] = useState<Chain | null>(null);

  useEffect(() => {
    if (typeof window.ethereum === 'undefined') {
      notification.warn({
        message: 'MetaMask Undetected',
        description: 'Please install MetaMask first! Otherwise, some functions will not work properly.',
        duration: LONG_DURATION,
      });
    }
  }, []);

  /**
   * connect to substrate or metamask when account type changed.
   */
  useEffect(() => {
    (async () => {
      setNetworkStatus('connecting');

      try {
        const { accounts: newAccounts, api: newApi, extensions } = await connectSubstrate(state.network);
        const chainState = await newApi?.rpc.system.properties();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { tokenDecimals, tokenSymbol, ss58Format } = chainState?.toHuman() as any;
        const chainInfo = tokenDecimals.reduce(
          (acc: Chain, decimal: string, index: number) => {
            const token = { decimal, symbol: tokenSymbol[index] };

            return { ...acc, tokens: [...acc.tokens, token] };
          },
          { ss58Format, tokens: [] } as Chain
        );

        await cryptoWaitReady();

        keyring.loadAll({
          genesisHash: newApi?.genesisHash,
          ss58Format,
        });

        setChain(chainInfo);
        setApi(newApi);
        setNetworkStatus('success');

        if (!extensions?.length && !newAccounts?.length) {
          setAccounts([]);
        } else {
          setAccounts(newAccounts as IAccountMeta[]);
        }

        patchUrl({ network: state.network });
      } catch (error) {
        setNetworkStatus('fail');
      }
    })();
  }, [state.network]);

  return (
    <ApiContext.Provider
      value={{
        ...state,
        dispatch,
        createAction,
        switchNetwork,
        setNetworkStatus,
        setAccounts,
        setApi,
        api,
        networkConfig: NETWORK_CONFIG[state.network],
        chain,
      }}
    >
      {children}
    </ApiContext.Provider>
  );
};

export const useApi = () => useContext(ApiContext) as Exclude<ApiCtx, null>;
