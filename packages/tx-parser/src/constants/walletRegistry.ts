type WalletCategory = 'kol' | 'whale' | 'dlmm' | 'trader' | 'other' | 'meme';

interface WalletInfo {
    label: string;
    category: WalletCategory;
}

const WALLET_REGISTRY: Record<string, WalletInfo> = {
    // ========== KOLs ==========
    'AVAZvHLR2PcWpDf8BXY4rVxNHYRBytycHkcB5z5QNXYm': { label: 'Ansem', category: 'kol' },
    '2DUVNBj1nsuCjmBquMoomXoTZJU4qZ8BR87J8ekuZZgd': { label: 'met', category: 'kol' },
    '9yYya3F5EJoLnBNKW6z4bZvyQytMXzDcpU5D6yYr4jqL': { label: 'KOL-3', category: 'kol' },
    'GAH2TKPtu7HSpbCkBMANPCDBSSaRFeSwoScfFRVF7oHa': { label: 'KOL-4', category: 'kol' },
    '3kebnKw7cPdSkLRfiMEALyZJGZ4wdiSRvmoN4rD1yPzV': { label: 'KOL-5', category: 'kol' },
    'BtMBMPkoNbnLF9Xn552guQq528KKXcsNBNNBre3oaQtr': { label: 'KOL-6', category: 'kol' },
    'mW4PZB45isHmnjGkLpJvjKBzVS5NXzTJ8UDyug4gTsM': { label: 'igndex', category: 'kol' },
    'DzeSE8ZBNk36qqswcDxd8919evdH5upwyZ4u1yieQSkp': { label: 'KOL-8', category: 'kol' },

    // ========== WHALES ==========
    'D6kLPZVdqqBw3np76Fg2xjA9JUwbsf6wPso1XkMV2mjy': { label: 'Whale-1', category: 'whale' },
    '9XxSUjAdCNy4Nbkm1BoWWEQk7A25YhC2CyGgYyp8HLsN': { label: 'Whale-2', category: 'whale' },
    'EnQLCLB7NWojruXXNopgH7jhkwoHihTpuzsrtsM2UCSe': { label: 'Whale-3', category: 'whale' },
    'EMSA63313xrhW3y1pooBDe51a1Vw5N2PpNw3hEmvG3Xg': { label: 'EMSA', category: 'whale' },
    '7nJSDa8nnBk6UXxJhRwSo7kFo3LnNMdbvVjPTmjTQkJG': { label: 'Whale-4', category: 'whale' },
    '68huFCtdyRKvZWrxLn2vohVrCha26S3UWUH8jaKG4YZ3': { label: 'Whale-5', category: 'whale' },
    'CcvvkyXwt8Vdr8C1dxRNTHTPzziuGcnf7i8AyAabpwrK': { label: 'Whale-6', category: 'whale' },
    'Fs7zZP3SnTfRTJxwbGCGuHWBQTKTRoJg8TpZTcALV7Q6': { label: 'Whale-7', category: 'whale' },
    'DBzjnFwh9AtxE7xXbA2PRoQzas37tPbcwQ3pchW1igNq': { label: 'Whale-8', category: 'whale' },
    'H3iAMzJQnstJaWD7XALtbJ6EHdZhFd4bwv9TJySmdkFs': { label: 'Whale-9', category: 'whale' },
    'H3b4acRdAGaspYs12sXHcnDmoUX9sb2ruEtc1PMksoLo': { label: 'Whale-10', category: 'whale' },
    'ARSdp5MFL1bjgWddK8dkF3QdttHvy5ZdVjJ6T8BHJimo': { label: 'Whale-11', category: 'whale' },
    '4HjGze3GXy8aWzWeuR5hFZP6ezqRb3yhLbQULhefzQdN': { label: 'Whale-12', category: 'whale' },
    'GeNH2iCTp3sQZjudjwDC5ZC3aGGMXLWBgTGwCJyXzbMf': { label: 'Whale-13', category: 'whale' },
    'HQks83EYr56oYio2mxgRsifm35bUgS53ZacYxP7H5XEd': { label: 'Whale-14', category: 'whale' },
    '8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6': { label: 'CookerFlips', category: 'whale' },
    '6ykoioDZEcC9Rk1vexd2F49KDHzP63nHh21Hm4CqrWtx': { label: 'Whale-15', category: 'whale' },
    '9E9PZMYZ4jed43bvyMBy2qamCf3PmLAfREJw4ueYbvmb': { label: 'Whale-16', category: 'whale' },
    'GHWLvfyVwmF7TmyVds8guPwsmeVNXnBc8qoJxmG4dLox': { label: 'Whale-17', category: 'whale' },


    // ========== MEME WALLETS ==========
    '73VhgAEtU7yUVURoSHp2AJVRvup1PeLSZSH5KFWzj46Y': { label: 'Meme-1', category: 'meme' },
    '63oQYEauMBFyaGQ69CNkwXFzCvdkFxdPaxGKYx72Tedb': { label: 'Meme-2', category: 'meme' },
    '7YjN5zV8iWKpG9cA6HyvrTWvgnfB3pEkADJAPq6DgXKv': { label: 'Meme-3', category: 'meme' },
    '76ZUBj1JLz7arTVHSRJok5oSTEqDuVBgySFMVHtzxzZc': { label: 'Meme-4', category: 'meme' },
    'ETgoSUwLhvRxmQzQg8PYMfnNiiHpXh5qojnAGms1kXu1': { label: 'Meme-5', category: 'meme' },
    '946Rx9X6et5DNZy5t6ncsmDodXLaU2s3vp8UfZHXHx2R': { label: 'Meme-6', category: 'meme' },


    // ========== DLMM LPs ==========
    '65tPpgEhTNMDe6xwqbWqxxHx7zHRQnTTHTyTbWpQKJFD': { label: 'DLMM-1', category: 'dlmm' },
    '5ZPczDuywV5GFwG6KnHjbj2eap9BBQZeyUUDwaFhRRmn': { label: 'DLMM-2', category: 'dlmm' },
    // Add more DLMM wallets here...

    // ========== TRADERS ==========
    '7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C': { label: 'jan_sol', category: 'trader' },
    '8zFZHuSRuDpuAR7J6FzwyF3vKNx4CVW3DFHJerQhc7Zd': { label: 'traderpow', category: 'trader' },
    'As7HjL7dzzvbRbaD3WCun47robib2kmAKRXMvjHkSMB5': { label: 'otta.sol', category: 'trader' },
    'sAdNbe1cKNMDqDsa4npB3TfL62T14uAo2MsUQfLvzLT': { label: 'pr6spr.sol', category: 'trader' },
    'DdvhMhDJsobQdCWuWunG2QNos2S3XrYGosRkkVWhjLeW': { label: '放手一搏.sol', category: 'trader' },
    'ApRnQN2HkbCn7W2WWiT2FEKvuKJp9LugRyAE1a9Hdz1': { label: 'solkcrow.sol', category: 'meme' },
    '215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP': { label: 'binladen.sol', category: 'trader' },
    '86AEJExyjeNNgcp7GrAvCXTDicf5aGWgoERbXFiG1EdD': { label: 'bundled.sol', category: 'trader' },
    '4nvNc7dDEqKKLM4Sr9Kgk3t1of6f8G66kT64VoC95LYh': { label: 'mambone.sol', category: 'trader' },
    '8rvAsDKeAcEjEkiZMug9k8v1y8mW6gQQiMobd89Uy7qR': { label: 'communitymember🚀.sol', category: 'trader' },
    'DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm': { label: 'gake', category: 'trader' },
    'CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o': { label: 'Cented7', category: 'trader' },
    'CBaM2xaPdDdhaopd8dD93LJAvextJoPngdKFz8QFP7JD': { label: 'poo.sol', category: 'trader' },
    'G5nxEXuFMfV74DSnsrSatqCW32F34XUnBeq3PfDS7w5E': { label: 'LeBron', category: 'trader' },
    'BDTscoqjWkgnySaJqukeSBLtKzcU5a9nTxi396zoBW9x': { label: 'abglover.sol', category: 'trader' },
    'DpNVrtA3ERfKzX4F8Pi2CVykdJJjoNxyY5QgoytAwD26': { label: 'Gorilla Capital', category: 'trader' },
    'D2wBctC1K2mEtA17i8ZfdEubkiksiAH2j8F7ri3ec71V': { label: 'Dior100x', category: 'trader' },

    // ========== OTHER ==========
    'D8Scu7uNmHbreAWLBf4QwjuX5EzYZB7d3VNNMetgqmXh': { label: 'Wallet-1', category: 'other' },
    'CziTTPb6A6hbsPtf5H5GLNCWNqqk4tesdj1DzWaQBoCL': { label: 'Wallet-4', category: 'other' },
    'A8vgGPT2Vg2bQEGwkVVd6J5iJaKUBLxjtraEXt55cYwV': { label: 'Wallet-5', category: 'other' },
    'GJA1HEbxGnqBhBifH9uQauzXSB53to5rhDrzmKxhSU65': { label: 'Wallet-7', category: 'other' },
    'HW2Cg9ZYRGZRzXfdgc1pgGxdYduyVvYrYkg1H2PVLo1H': { label: 'Wallet-11', category: 'other' },
    'qTB6ryTHBU1tGEVg9a1QiRJh5euRAU3bcDdWubUJ4ne': { label: 'Wallet-13', category: 'other' },
    'BC8yiFFQWFEKrEEj75zYsuK3ZDCfv6QEeMRif9oZZ9TW': { label: 'Wallet-14', category: 'other' },
    'GqWHWPXeaYH8USxfpxP38DTYbjeCKQZnBAf8DK9nyf5Y': { label: 'Wallet-20', category: 'other' },
    'EDozia8CitSkQCnpXu3ekLJCoiLvPUWWLgiRTKiES2j2': { label: 'Wallet-24', category: 'other' },
    'm7Kaas3Kd8FHLnCioSjCoSuVDReZ6FDNBVM6HTNYuF7': { label: 'Wallet-25', category: 'other' },
    'Gdaqp3ND6r3HVAWXpawkQU18EuQqwNxpaeeio8ASVAYd': { label: 'Wallet-27', category: 'other' },
    '3pZ59YENxDAcjaKa3sahZJBcgER4rGYi4v6BpPurmsGj': { label: 'Wallet-29', category: 'other' },
    '9qwZtGC9B1isBzj3gyHtM57ffiyY2jvGUt2XP28hHHmS': { label: 'W-31', category: 'other' },
    'CTRWQ3mn1VSPdZgJdA3GiLCcBo1vA24gPnZGma89mrKn': { label: 'W-32', category: 'other' },
    'EuC9bwq7AhtvgqhzFG5TtB2q8PYmgWbQ7Eei7FaC4oG3': { label: 'Wallet-34', category: 'other' },
    '4EsY8HQB4Ak65diFrSHjwWhKSGC8sKmnzyusM993gk2w': { label: 'Wallet-35', category: 'other' },
    '49FQaWoguyV4UHkpQnRbfhyrgsngSXTxE4gR2sntypS6': { label: 'Wallet-39', category: 'other' },
    'GwyG5FQRNtY1faXYWdTLbcDNZTyW5d2Z63o1UiMUDQDT': { label: 'Wallet-40', category: 'other' },
    '4cXnf2z85UiZ5cyKsPMEULq1yufAtpkatmX4j4DBZqj2': { label: 'Wallet-41', category: 'meme' },
    '4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk': { label: 'Wallet-42', category: 'other' },
    'Aw1ici3XZ2AfBUfy6apUHRQiTEJGm2Hybhqj2Jfxf2mS': { label: 'Wallet-43', category: 'other' },
    'BoYHJoKntk3pjkaV8qFojEonSPWmWMfQocZTwDd1bcGG': { label: 'Wallet-44', category: 'other' },
    '7VBTpiiEjkwRbRGHJFUz6o5fWuhPFtAmy8JGhNqwHNnn': { label: 'Wallet-45', category: 'other' },
    'GWc85m5984LrD7xT4CApdY21n9TiByL5yYkPjJStZi5v': { label: 'Wallet-71', category: 'other' },
    '7hDYFYF9PVVyEmDUdUzXFt5PCkmm9PrtpP6x9iHrLCHF': { label: 'Wallet-72', category: 'other' },
    'LGLDRembAFreaCd9uSSvURTb3phoRdbskDCxpX46seB': { label: 'Wallet-73', category: 'other' },
    '33MuTy5vo3GymDT6rhmA1trYH3ySWcgYa1HSVxD9Tko5': { label: 'Wallet-74', category: 'other' },
    'D7HRiKDNxfwV4KUMdeV4HrWCQn9uDovWZXxS7X6L6pJi': { label: 'Wallet-75', category: 'other' },
    '86ssNTYmFVux4NABe22hjjicVsgLzaNfgQzLa1ScicPg': { label: 'Wallet-76', category: 'other' },
    '3h65MmPZksoKKyEpEjnWU2Yk2iYT5oZDNitGy5cTaxoE': { label: 'Wallet-77', category: 'other' },
    'DUMP3pM27QXLgHQSNYmPwiwkSrMMXwWiR1ETNpd4uALc': { label: 'DUMP', category: 'other' },
    'FRbUNvGxynPWkqm5VsdCvyS2QmNht2UFrKJHga54o': { label: 'Wallet-79', category: 'other' },
    'DQu6RDQpMCBn4ZZLL5Wdmn2FqjTu7d2yBTaA22K3xLdv': { label: 'Wallet-80', category: 'other' },
};

const CATEGORY_EMOJI: Record<WalletCategory, string> = {
    'kol': '🎤',
    'whale': '🐋',
    'dlmm': '💧',
    'trader': '📈',
    'other': '👛',
    'meme': 'meme'
};


function getWalletInfo(address: string): WalletInfo {
    return WALLET_REGISTRY[address] || { label: address.slice(0, 8) + '...', category: 'other' };
}

function getWalletLabel(address: string): string {
    const info = getWalletInfo(address);
    const emoji = CATEGORY_EMOJI[info.category];
    return `${emoji} ${info.label}`;
}

function getWalletsByCategory(category: WalletCategory | 'all'): string[] {
    if (category === 'all') {
        return Object.keys(WALLET_REGISTRY);
    }

    return Object.entries(WALLET_REGISTRY)
        .filter(([_, info]) => info.category === category)
        .map(([address, _]) => address);
}