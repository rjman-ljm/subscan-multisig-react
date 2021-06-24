/* eslint-disable no-invalid-this */
// Copyright 2017-2021 @polkadot/react-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { keyring } from '@polkadot/ui-keyring';
import { createOptionItem } from '@polkadot/ui-keyring/options/item';
import type {
  KeyringOption$Type,
  KeyringOptions,
  KeyringSectionOption,
  KeyringSectionOptions,
} from '@polkadot/ui-keyring/options/types';
import { isNull, isUndefined } from '@polkadot/util';
import React from 'react';
import store from 'store';
import styled from 'styled-components';
import { withMulti, withObservable } from '@polkadot/react-api/hoc';
import Dropdown from '../Dropdown';
import Static from '../Static';
import { getAddressName } from '../util';
import addressToAddress from '../util/toAddress';
import createHeader from './createHeader';
import createItem from './createItem';
import type { Option } from './types';

interface Props {
  className?: string;
  defaultValue?: Uint8Array | string | null;
  filter?: string[];
  help?: React.ReactNode;
  hideAddress?: boolean;
  isDisabled?: boolean;
  isError?: boolean;
  isInput?: boolean;
  isMultiple?: boolean;
  label?: React.ReactNode;
  labelExtra?: React.ReactNode;
  onChange?: (value: string | null) => void;
  onChangeMulti?: (value: string[]) => void;
  options?: KeyringSectionOption[];
  optionsAll?: Record<string, Option[]>;
  placeholder?: string;
  type?: KeyringOption$Type;
  value?: string | Uint8Array | string[] | null;
  withEllipsis?: boolean;
  withLabel?: boolean;
}

type ExportedType = React.ComponentType<Props> & {
  createOption: (option: KeyringSectionOption, isUppercase?: boolean) => Option;
  setLastValue: (type: KeyringOption$Type, value: string) => void;
};

interface State {
  lastValue?: string;
  value?: string | string[];
}

const STORAGE_KEY = 'options:InputAddress';
const DEFAULT_TYPE = 'all';
const MULTI_DEFAULT: string[] = [];

function transformToAddress(value?: string | Uint8Array | null): string | null {
  try {
    return addressToAddress(value) || null;
  } catch (error) {
    // noop, handled by return
  }

  return null;
}

function transformToAccountId(value: string): string | null {
  if (!value) {
    return null;
  }

  const accountId = transformToAddress(value);

  return !accountId ? null : accountId;
}

function createOption(address: string): Option {
  let isRecent: boolean | undefined;
  const pair = keyring.getAccount(address);
  let name: string | undefined;

  if (pair) {
    name = pair.meta.name;
  } else {
    const addr = keyring.getAddress(address);

    if (addr) {
      name = addr.meta.name;
      isRecent = addr.meta.isRecent;
    } else {
      isRecent = true;
    }
  }

  return createItem(createOptionItem(address, name), !isRecent);
}

function readOptions(): Record<string, Record<string, string>> {
  return (store.get(STORAGE_KEY) as Record<string, Record<string, string>>) || { defaults: {} };
}

function getLastValue(type: KeyringOption$Type = DEFAULT_TYPE): string {
  const options = readOptions();

  return options.defaults[type];
}

function setLastValue(type: KeyringOption$Type = DEFAULT_TYPE, value: string): void {
  const options = readOptions();

  options.defaults[type] = value;
  store.set(STORAGE_KEY, options);
}

class InputAddress extends React.PureComponent<Props, State> {
  public state: State = {};

  public static getDerivedStateFromProps({ type, value }: Props, { lastValue }: State): Pick<State, never> | null {
    try {
      return {
        lastValue: lastValue || getLastValue(type),
        value: Array.isArray(value) ? value.map((v) => addressToAddress(v)) : addressToAddress(value) || undefined,
      };
    } catch (error) {
      return null;
    }
  }

  // eslint-disable-next-line complexity
  public render(): React.ReactNode {
    const {
      className = '',
      defaultValue,
      help,
      hideAddress = false,
      isDisabled = false,
      isError,
      isMultiple,
      label,
      labelExtra,
      options,
      optionsAll,
      placeholder,
      type = DEFAULT_TYPE,
      withEllipsis,
      withLabel,
    } = this.props;
    const hasOptions = (options && options.length !== 0) || (optionsAll && Object.keys(optionsAll[type]).length !== 0);

    // the options could be delayed, don't render without
    if (!hasOptions && !isDisabled) {
      // This is nasty, but since this things is non-functional, there is not much
      // we can do (well, wrap it, however that approach is deprecated here)
      return (
        <Static className={className} help={help} label={label}>
          No accounts are available for selection.
        </Static>
      );
    }

    const { lastValue, value } = this.state;
    const lastOption = this.getLastOptionValue();
    const actualValue = transformToAddress(
      isDisabled || (defaultValue && this.hasValue(defaultValue))
        ? defaultValue
        : this.hasValue(lastValue)
        ? lastValue
        : lastOption && lastOption.value
    );
    const actualOptions: Option[] = options
      ? options.map((o): Option => createItem(o))
      : isDisabled && actualValue
      ? [createOption(actualValue)]
      : this.getFiltered();
    const _defaultValue = isMultiple || !isUndefined(value) ? undefined : actualValue;

    return (
      <Dropdown
        className={`ui--InputAddress${hideAddress ? ' hideAddress' : ''} ${className}`}
        defaultValue={_defaultValue}
        help={help}
        isDisabled={isDisabled}
        isError={isError}
        isMultiple={isMultiple}
        label={label}
        labelExtra={labelExtra}
        onChange={isMultiple ? this.onChangeMulti : this.onChange}
        onSearch={this.onSearch}
        options={actualOptions}
        placeholder={placeholder}
        renderLabel={isMultiple ? this.renderLabel : undefined}
        value={isMultiple && !value ? MULTI_DEFAULT : value}
        withEllipsis={withEllipsis}
        withLabel={withLabel}
      />
    );
  }

  private renderLabel = ({ value }: KeyringSectionOption): React.ReactNode => {
    if (!value) {
      return undefined;
    }

    return getAddressName(value);
  };

  private getLastOptionValue(): KeyringSectionOption | undefined {
    const available = this.getFiltered();

    return available.length ? available[available.length - 1] : undefined;
  }

  private hasValue(test?: Uint8Array | string | null): boolean {
    return this.getFiltered().some(({ value }) => test === value);
  }

  private getFiltered(): Option[] {
    const { filter, optionsAll, type = DEFAULT_TYPE } = this.props;

    return !optionsAll ? [] : optionsAll[type].filter(({ value }) => !filter || (!!value && filter.includes(value)));
  }

  private onChange = (address: string): void => {
    const { filter, onChange, type } = this.props;

    // eslint-disable-next-line
    !filter && setLastValue(type, address);

    // eslint-disable-next-line
    onChange && onChange(this.hasValue(address) ? transformToAccountId(address) : null);
  };

  private onChangeMulti = (addresses: string[]): void => {
    const { onChangeMulti } = this.props;

    if (onChangeMulti) {
      onChangeMulti(addresses.map(transformToAccountId).filter((address) => address as string) as string[]);
    }
  };

  private onSearch = (filteredOptions: KeyringSectionOptions, _query: string): KeyringSectionOptions => {
    const { isInput = true } = this.props;
    const query = _query.trim();
    const queryLower = query.toLowerCase();
    const matches = filteredOptions.filter(
      (item): boolean =>
        !!item.value &&
        ((item.name.toLowerCase && item.name.toLowerCase().includes(queryLower)) ||
          item.value.toLowerCase().includes(queryLower))
    );

    if (isInput && matches.length === 0) {
      const accountId = transformToAccountId(query);

      if (accountId) {
        matches.push(keyring.saveRecent(accountId.toString()).option);
      }
    }

    return matches.filter((item, index): boolean => {
      const isLast = index === matches.length - 1;
      const nextItem = matches[index + 1];
      const hasNext = nextItem && nextItem.value;

      return !(isNull(item.value) || isUndefined(item.value)) || (!isLast && !!hasNext);
    });
  };
}

export const PureInputAddress = styled(InputAddress)`
  .ui.dropdown .text {
    width: 100%;
  }

  .ui.disabled.search {
    pointer-events: all;
  }

  .ui.search.selection.dropdown {
    > .text > .ui--KeyPair {
      .ui--IdentityIcon {
        left: -2.75rem;
        top: -1.05rem;

        > div,
        img,
        svg {
          height: 32px !important;
          width: 32px !important;
        }
      }

      .name {
        margin-left: 0;

        > .ui--AccountName {
          height: auto;
        }
      }
    }

    > .menu > div.item > .ui--KeyPair > .name > .ui--AccountName {
      height: auto;
    }
  }

  &.hideAddress .ui.search.selection.dropdown > .text > .ui--KeyPair .address {
    flex: 0;
    max-width: 0;
  }
`;

const ExportedComponent = withMulti(
  PureInputAddress,
  withObservable(keyring.keyringOption.optionsSubject, {
    propName: 'optionsAll',
    transform: (optionsAll: KeyringOptions): Record<string, (Option | React.ReactNode)[]> =>
      Object.entries(optionsAll).reduce(
        (
          result: Record<string, (Option | React.ReactNode)[]>,
          [type, options]
        ): Record<string, (Option | React.ReactNode)[]> => {
          result[type] = options.map((option): Option | React.ReactNode =>
            option.value === null ? createHeader(option) : createItem(option)
          );

          return result;
        },
        {}
      ),
  })
) as ExportedType;

ExportedComponent.createOption = createItem;
ExportedComponent.setLastValue = setLastValue;

export default ExportedComponent;
