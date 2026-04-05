import { defaultSearchModeOptions } from '../utils/searchModes'
import { SEARCH_INPUT_TITLES } from '../utils/asciiUiStrings.js'
import './SearchInputWithModes.css'

export default function SearchInputWithModes ({
  value,
  onChange,
  options = defaultSearchModeOptions(),
  onOptionsChange,
  placeholder,
  className = '',
  inputClassName = '',
  inputRef,
  onClear,
  disabled = false,
  ...inputRest
}) {
  const setOpt = (key) => {
    onOptionsChange({ ...options, [key]: !options[key] })
  }

  const handleClear = () => {
    if (onClear) onClear()
    else onChange({ target: { value: '' } })
  }

  const Ti = SEARCH_INPUT_TITLES

  return (
    <div className={'pm-search-wrap ' + className}>
      <input
        ref={inputRef}
        type="text"
        className={'pm-search-field ' + inputClassName}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        {...inputRest}
      />
      <div className="pm-search-trailing" aria-hidden="true">
        {value ? (
          <button
            type="button"
            className="pm-search-tbtn pm-search-clear"
            onClick={handleClear}
            title={Ti.clear}
          >&times;</button>
        ) : null}
        <button
          type="button"
          className={'pm-search-tbtn' + (options.matchCase ? ' active' : '')}
          onClick={() => setOpt('matchCase')}
          title={Ti.matchCase}
        >Aa</button>
        <button
          type="button"
          className={'pm-search-tbtn pm-search-ww' + (options.wholeWord ? ' active' : '')}
          onClick={() => setOpt('wholeWord')}
          title={Ti.wholeWord}
        >
          <span className="pm-search-ww-a">a</span>
          <span className="pm-search-ww-b">b</span>
        </button>
        <button
          type="button"
          className={'pm-search-tbtn pm-search-re' + (options.useRegex ? ' active' : '')}
          onClick={() => setOpt('useRegex')}
          title={Ti.useRegex}
        >.*</button>
      </div>
    </div>
  )
}
