import React, { useState, useRef } from 'react'
import { Input, InputNumber, Divider, Space, Button, Slider } from 'antd'
import { hot } from 'react-hot-loader'
import ReactPlayer from 'react-player'
import { VideoSeekSlider } from 'react-video-seek-slider'

import useLocalStorage from 'hooks/useLocalStorage'

import './Root.css'
import 'react-video-seek-slider/lib/ui-video-seek-slider.css'

const Root = () => {
	const [ runningUrl, setRunningUrl ] = useState(null)
	const [ playing, setPlaying ] = useState(false)

	const [ played, setPlayed ] = useState(0)
	const [ loaded, setLoaded ] = useState(0)
	const [ duration, setDuration ] = useState(0)
	const [ playbackRate, setPlaybackRate ] = useState(1.0)

	const [ notes, setNotes ] = useLocalStorage('notes', '')

	const [ volume, setVolume ] = useState(1.0)

	const [ urlBar, setUrlBar ] = useState('')

	const handlePlay = () => {
		setPlaying(true)
	}
	const handlePause = () => {
		setPlaying(false)
	}
	const handlePlayPause = () => {
		setPlaying((prevValue) => !prevValue)
	}

	const playerRef = useRef(null)

	const formattedTime = getFormattedTime(played * duration)

	return (
		<div className="app">
			<div>
				<label>Url:</label>
				<div style={{ display: 'flex' }}>
					<Input value={urlBar} onChange={(e) => setUrlBar(e.target.value)} />
					<Button
						onClick={() => {
							setRunningUrl(urlBar)
							setPlayed(0)
							setLoaded(0)
						}}
					>
						Load
					</Button>
				</div>
			</div>
			<div style={{ display: 'flex', marginTop: 10 }}>
				<div
					className="player-wrapper"
					onClick={() => {
						handlePlayPause()
					}}
				>
					<ReactPlayer
						ref={playerRef}
						className="react-player"
						width="100%"
						height="100%"
						url={runningUrl}
						playing={playing}
						playbackRate={playbackRate}
						volume={volume}
						onPlay={handlePlay}
						onPause={handlePause}
						onError={(e) => console.log('onError', e)}
						onProgress={({ playedSeconds, loaded, loadedSeconds, played }) => {
							setLoaded(loaded)
							setPlayed(played)
						}}
						onDuration={(val) => setDuration(val)}
					/>
					<div
						style={{ marginTop: -25 }}
						onClick={(e) => {
							e.stopPropagation()
						}}
					>
						<VideoSeekSlider
							min={0}
							max={duration}
							currentTime={played * duration}
							progress={loaded * duration}
							onChange={(time) => {
								const newPlayed = parseFloat(time / duration)
								setPlayed(newPlayed)
								playerRef.current.seekTo(newPlayed)
							}}
							offset={0}
							secondsPrefix="00:00:"
							minutesPrefix="00:"
						/>
					</div>
					{formattedTime}
				</div>
				<div style={{ flex: 1 }}>
					<div>
						<Divider>Control</Divider>
						<Space>
							<Button onClick={handlePlayPause}>{playing ? 'Pause' : 'Play'}</Button>
						</Space>
						<Divider>Time</Divider>
						<Space>
							<Button
								onClick={() => {
									const newPlayed = played - 5 / duration
									setPlayed(newPlayed)
									playerRef.current.seekTo(newPlayed)
								}}
							>
								-5s
							</Button>
							<Button
								onClick={() => {
									const newPlayed = played - 1 / duration
									setPlayed(newPlayed)
									playerRef.current.seekTo(newPlayed)
								}}
							>
								-1s
							</Button>
							<Button
								onClick={() => {
									const newPlayed = played + 1 / duration
									setPlayed(newPlayed)
									playerRef.current.seekTo(newPlayed)
								}}
							>
								+1s
							</Button>
							<Button
								onClick={() => {
									const newPlayed = played + 5 / duration
									setPlayed(newPlayed)
									playerRef.current.seekTo(newPlayed)
								}}
							>
								+5s
							</Button>
						</Space>
						<Divider>Speed</Divider>
						<Space>
							<Button onClick={() => setPlaybackRate(1)}>1x</Button>
							<Button onClick={() => setPlaybackRate(1.5)}>1.5x</Button>
							<Button onClick={() => setPlaybackRate(2)}>2x</Button>
						</Space>
						<Divider>Volume</Divider>
						<Slider
							// type="range"
							min={0}
							max={100}
							// step="any"
							value={volume * 100}
							onChange={(val) => setVolume(parseFloat(val / 100))}
						/>

						<Divider>Frame</Divider>

						<div style={{ display: 'flex', flexDirection: 'column' }}>
							<h1 style={{ marginTop: -15, marginBottom: 0, fontSize: '3em' }}>
								{Math.round(duration * 24 * played)}
							</h1>
							<a
								style={{ marginTop: -10 }}
								onClick={() => {
									setNotes(notes + `\n${Math.round(duration * 24 * played)}`)
								}}
							>
								Add
							</a>
							<InputNumber
								style={{ width: '100%' }}
								placeholder="Go to:"
								onKeyUp={(e) => {
									if (e.key === 'Enter') {
										const newPlayed = e.target.value / 24 / duration
										setPlayed(newPlayed)
										playerRef.current.seekTo(newPlayed)
									}
								}}
							/>
						</div>

						<Divider>Notes</Divider>

						<Input.TextArea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							style={{ width: '100%' }}
							rows="10"
						/>
					</div>
				</div>
			</div>
		</div>
	)
}

const getFormattedTime = (seconds) => {
	let hours = Math.floor(seconds / 3600)
	let divirsForMinutes = seconds % 3600
	let minutes = Math.floor(divirsForMinutes / 60)
	let sec = Math.ceil(divirsForMinutes % 60)

	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${sec
		.toString()
		.padStart(2, '0')}`
}

export default hot(module)(Root)
