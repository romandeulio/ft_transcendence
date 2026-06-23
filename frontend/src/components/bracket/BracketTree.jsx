import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PlayerBlock from './PlayerBlock'
import styles from './BracketTree.module.css'

function createEmptyRounds() {
  const teamCount = 2
  const bracketSize = 1 << Math.ceil(Math.log2(teamCount))
  const totalRounds = Math.max(1, Math.log2(bracketSize))

  return Array.from({ length: totalRounds }, (_, roundIndex) => {
    const round = roundIndex + 1
    const matchCount = bracketSize / (2 ** round)
    return {
      round,
      matches: Array.from({ length: matchCount }, (_, matchIndex) => ({
        id: `empty-r${round}-${matchIndex}`,
        team1: null,
        team2: null,
        winner: null,
        status: 'PENDING',
      })),
    }
  })
}

function teamName(team) {
  return team?.label || null
}

function MatchBlock({ match, isFinal = false, canReport = false, onWinner, onPostpone }) {
  const done = match.status === 'DONE'
  const p1 = teamName(match.team1)
  const p2 = teamName(match.team2)
  const winner = teamName(match.winner)
  const canSelectWinner = canReport && !done && match.team1 && match.team2

  return (
    <div className={`${styles.match} ${isFinal ? styles.final : ''}`}>
      {isFinal && <div className={styles.crown}>🏆</div>}
      <PlayerBlock
        name={p1}
        winner={done && winner === p1}
        eliminated={done && p1 && winner !== p1}
        tbd={!p1 && !match.is_bye}
        bye={!p1 && match.is_bye}
        onClick={canSelectWinner ? () => onWinner?.(match, match.team1.id) : undefined}
      />
      <div className={styles.sep} />
      <PlayerBlock
        name={p2}
        winner={done && winner === p2}
        eliminated={done && p2 && winner !== p2}
        tbd={!p2 && !match.is_bye}
        bye={!p2 && match.is_bye}
        onClick={canSelectWinner ? () => onWinner?.(match, match.team2.id) : undefined}
      />
    </div>
  )
}

function roundLabel(t, round, totalRounds, format) {
  // Swiss / Round Robin : pas de phases finales, on numérote les rounds.
  if (format === 'SWISS' || format === 'ROUND_ROBIN') {
    return t('bracket.round', { n: round })
  }
  if (round === totalRounds) return t('bracket.final')
  if (round === totalRounds - 1) return t('bracket.semis')
  if (round === totalRounds - 2) return t('bracket.quarters')
  if (round === totalRounds - 3) return t('bracket.eighths')
  return t('bracket.round', { n: round })
}

export default function BracketTree({ rounds, format = 'SINGLE_ELIMINATION', canReport = false, onWinner, onPostpone }) {
  const { t } = useTranslation()
  const isElimination = format === 'SINGLE_ELIMINATION'
  const treeRef = useRef(null)
  const matchRefs = useRef(new Map())

  useEffect(() => {
    const el = treeRef.current
    if (!el) return
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaY + e.deltaX
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  const [connectorState, setConnectorState] = useState({ width: 0, height: 0, paths: [] })
  const displayedRounds = useMemo(
    () => (rounds?.length ? rounds : createEmptyRounds()).map(round => ({
      ...round,
      matches: Array.isArray(round.matches) ? round.matches : [],
    })),
    [rounds],
  )
  const totalRounds = displayedRounds.length
  const maxMatches = Math.max(...displayedRounds.map(round => round.matches.length), 1)
  const layoutKey = displayedRounds
    .map(round => `${round.round}:${round.matches.map(match => match.id).join(',')}`)
    .join('|')

  const setMatchRef = useCallback((key, node) => {
    if (node) {
      matchRefs.current.set(key, node)
    } else {
      matchRefs.current.delete(key)
    }
  }, [])

  useLayoutEffect(() => {
    const tree = treeRef.current
    if (!tree) return undefined

    let frameId = null
    const calculateConnectors = () => {
      frameId = null
      const treeRect = tree.getBoundingClientRect()
      const paths = []

      for (let roundIndex = 0; roundIndex < totalRounds - 1; roundIndex += 1) {
        const sourceRound = displayedRounds[roundIndex]
        const targetRound = displayedRounds[roundIndex + 1]

        targetRound.matches.forEach((targetMatch, targetIndex) => {
          const targetNode = matchRefs.current.get(`${roundIndex + 1}-${targetMatch.id}`)
          if (!targetNode) return

          const targetRect = targetNode.getBoundingClientRect()
          const endX = targetRect.left - treeRect.left
          const endY = targetRect.top + targetRect.height / 2 - treeRect.top

          for (let sourceOffset = 0; sourceOffset < 2; sourceOffset += 1) {
            const sourceMatch = sourceRound.matches[targetIndex * 2 + sourceOffset]
            if (!sourceMatch) continue

            const sourceNode = matchRefs.current.get(`${roundIndex}-${sourceMatch.id}`)
            if (!sourceNode) continue

            const sourceRect = sourceNode.getBoundingClientRect()
            const startX = sourceRect.right - treeRect.left
            const startY = sourceRect.top + sourceRect.height / 2 - treeRect.top
            const midX = startX + (endX - startX) / 2

            paths.push(`M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`)
          }
        })
      }

      setConnectorState({
        width: Math.max(tree.scrollWidth, treeRect.width),
        height: Math.max(tree.scrollHeight, treeRect.height),
        paths,
      })
    }

    const scheduleCalculation = () => {
      if (frameId != null) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(calculateConnectors)
    }

    scheduleCalculation()
    const observer = new ResizeObserver(scheduleCalculation)
    observer.observe(tree)
    window.addEventListener('resize', scheduleCalculation)

    return () => {
      if (frameId != null) cancelAnimationFrame(frameId)
      observer.disconnect()
      window.removeEventListener('resize', scheduleCalculation)
    }
  }, [displayedRounds, layoutKey, totalRounds])

  return (
    <div
      ref={treeRef}
      className={styles.tree}
      style={{
        '--round-count': totalRounds,
        '--max-matches': maxMatches,
      }}
    >
      {connectorState.paths.length > 0 && (
        <svg
          className={styles.connectorLayer}
          viewBox={`0 0 ${connectorState.width} ${connectorState.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {connectorState.paths.map((path, index) => (
            <path key={`${path}-${index}`} className={styles.connectorPath} d={path} />
          ))}
        </svg>
      )}
      {displayedRounds.map((round, roundIndex) => (
        <div className={styles.round} key={round.round} style={{ '--match-count': round.matches.length }}>
          <div className={styles.roundLabel}>{roundLabel(t, round.round, totalRounds, format)}</div>
          <div className={styles.slots}>
            {round.matches.map(match => (
              <div
                key={match.id}
                ref={(node) => setMatchRef(`${roundIndex}-${match.id}`, node)}
                className={styles.slotDynamic}
              >
                <MatchBlock
                  match={match}
                  isFinal={isElimination && roundIndex === totalRounds - 1}
                  canReport={canReport}
                  onWinner={onWinner}
                  onPostpone={onPostpone}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
