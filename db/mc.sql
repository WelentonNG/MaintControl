-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Tempo de geração: 23/11/2025 às 01:43
-- Versão do servidor: 10.4.32-MariaDB
-- Versão do PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `maintcontrol_db`
--

-- --------------------------------------------------------

--
-- Estrutura para tabela `agendamentos`
--

CREATE TABLE `agendamentos` (
  `id` int(11) NOT NULL,
  `maquina_id` int(11) NOT NULL,
  `data_agendada` date NOT NULL,
  `observacoes` text DEFAULT NULL,
  `criado_em` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `historico`
--

CREATE TABLE `historico` (
  `id` int(11) NOT NULL,
  `maquina_id` int(11) NOT NULL,
  `data_hora` datetime DEFAULT current_timestamp(),
  `descricao` text NOT NULL,
  `tipo` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `manutencoes`
--

CREATE TABLE `manutencoes` (
  `id` int(11) NOT NULL,
  `maquina_id` int(11) NOT NULL,
  `data_servico` date NOT NULL,
  `tipo_servico` varchar(100) NOT NULL,
  `custo` decimal(10,2) DEFAULT NULL,
  `responsavel` varchar(100) DEFAULT NULL,
  `observacoes` text DEFAULT NULL,
  `data_fim` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estrutura para tabela `maquinas`
--

CREATE TABLE `maquinas` (
  `id` int(11) NOT NULL,
  `nome` varchar(100) NOT NULL,
  `descricao` text DEFAULT NULL,
  `tag` varchar(50) NOT NULL,
  `horas_uso` int(11) DEFAULT 0,
  `status` enum('OK','EM OPERAÇÃO','EM MANUTENÇÃO','INOPERANTE','ESPERANDO PEÇAS','HORAS EXCEDENTES') DEFAULT 'OK'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Despejando dados para a tabela `maquinas`
--

INSERT INTO `maquinas` (`id`, `nome`, `descricao`, `tag`, `horas_uso`, `status`) VALUES
(209, 'DOBRADEIRA HIDRAULICA', '1\"X4MT', 'W001', 1, 'INOPERANTE'),
(210, 'GUILHOTINA', 'Capacidade: 8MMX4MT', 'W002', 1, 'INOPERANTE'),
(211, 'PLASMA POWEMAX 105', 'Capacidade: 25,4', 'W003', 1, 'EM OPERAÇÃO'),
(212, 'PLASMA POWEMAX 105 SINC', 'Capacidade: 25,4', 'W004', 1, 'OK'),
(213, 'PLASMA POWEMAX 1650', 'Capacidade: 25,4', 'W005', 1, 'HORAS EXCEDENTES'),
(214, 'CALNADRA CALFLAN', 'Capacidade: 12,7X2.500', 'W006', 1, 'HORAS EXCEDENTES'),
(215, 'CALNDRA AGA 6X3000', 'Capacidade: 5X2.500', 'W007', 1, 'EM OPERAÇÃO'),
(216, 'CALANDRA AGA 4,5X3000', 'Capacidade: 4X2000', 'W008', 1, 'EM OPERAÇÃO'),
(217, 'PORTICO 1000KG', 'Capacidade: 1000KG', 'W009', 1, 'EM OPERAÇÃO'),
(218, 'CALANDRA AGA DE PERFIL', 'Capacidade: 6MM', 'W010', 1, 'EM OPERAÇÃO'),
(219, 'MESA POCIONARA P/PMSSS', 'Capacidade: 24\"', 'W011', 1, 'EM OPERAÇÃO'),
(220, 'ROBÓ DE SOLDA MIG', 'Capacidade: 1500MM', 'W012', 1, 'HORAS EXCEDENTES'),
(221, 'SERRA FITA', 'Capacidade: 16\"', 'W013', 1, 'OK'),
(222, 'TORNO NARDINE', 'Capacidade: 36\"', 'W014', 1, 'HORAS EXCEDENTES'),
(223, 'TORNO POREBA', 'N/A', 'W015', 1, 'HORAS EXCEDENTES'),
(224, 'TORNO', 'Capacidade: 12\"', 'W016', 1, 'HORAS EXCEDENTES'),
(225, 'PRENSA 65X1200', 'Capacidade: 65 TONELADAS', 'W017', 1, 'EM OPERAÇÃO'),
(226, 'PRENSA 65X2500', 'Capacidade: 65 TONELADAS', 'W018', 1, 'EM OPERAÇÃO'),
(227, 'PRENSA 200X2500', 'Capacidade: 200 TONELADAS', 'W019', 1, 'HORAS EXCEDENTES'),
(228, 'PRESNA 200X1500', 'Capacidade: 200 TONELADAS', 'W020', 1, 'EM OPERAÇÃO'),
(229, 'MAQ/COR/MASTER 20', 'Capacidade: 3\"', 'W021', 1, 'INOPERANTE'),
(230, 'COLLLER REFRIGERAÇAO', 'Capacidade: 10L', 'W022', 1, 'EM OPERAÇÃO'),
(231, 'COLLLER REFRIGERAÇAO', 'Capacidade: 10L', 'W023', 1, 'EM OPERAÇÃO'),
(232, 'COLLLER REFRIGERAÇAO', 'Capacidade: 10L', 'W024', 1, 'EM OPERAÇÃO'),
(233, 'COLLLER REFRIGERAÇAO', 'Capacidade: 10L', 'W025', 1, 'INOPERANTE'),
(234, 'COLLLER REFRIGERAÇAO', 'Capacidade: 10L', 'W026', 1, 'EM OPERAÇÃO'),
(235, 'COLLLER REFRIGERAÇAO', 'Capacidade: 10L', 'W027', 1, 'INOPERANTE'),
(236, 'M/S/MASTER 350 MULLER', 'Capacidade: 350A', 'W028', 1, 'HORAS EXCEDENTES'),
(237, 'M/S/MASTER 350 MULLER', 'Capacidade: 350A', 'W029', 1, 'HORAS EXCEDENTES'),
(238, 'M/S/MASTER 350 MULLER', 'Capacidade: 350A', 'W030', 1, 'HORAS EXCEDENTES'),
(239, 'M/S/MASTER 350 MULLER', 'Capacidade: 350A', 'W031', 1, 'INOPERANTE'),
(240, 'M/S/MASTER 350 MULLER', 'Capacidade: 350A', 'W032', 1, 'INOPERANTE'),
(241, 'M/S/MASTER 350 MULLER', 'Capacidade: 350A', 'W033', 1, 'INOPERANTE'),
(242, 'M/S/MASTER 350 MULLER', 'Capacidade: 350A', 'W034', 1, 'INOPERANTE'),
(243, 'M/S/BINZEL 310', 'Capacidade: 310A', 'W035', 1, 'EM OPERAÇÃO'),
(244, 'M/S/BINZEL 310', 'Capacidade: 310A', 'W036', 1, 'EM OPERAÇÃO'),
(245, 'M/S/BINZEL 310', 'Capacidade: 310A', 'W037', 1, 'EM OPERAÇÃO'),
(246, 'M/S/BINZEL', 'Capacidade: 210A', 'W038', 1, 'EM OPERAÇÃO'),
(247, 'M/SOLDA TIG MKR 500', 'Capacidade: 500A', 'W039', 2, 'OK'),
(248, 'M/SOLDA TIG MKR 350', 'Capacidade: 350A', 'W040', 1, 'OK'),
(249, 'M/SOLDA TIG LINCOIN', 'Capacidade: 510A', 'W041', 1, 'OK'),
(250, 'EMPILHADERA HASTER 90', 'Capacidade: 3900KG', 'W042', 1, 'INOPERANTE'),
(251, 'EMPILHADERA YALE', 'N/A', 'W043', 1, 'INOPERANTE'),
(252, 'EMPILHADERA HASTER 60', 'N/A', 'W044', 1, 'INOPERANTE'),
(253, 'PÓRTICO 2500 kg', 'N/A', 'W045', 1, 'EM OPERAÇÃO'),
(254, 'COMPRESSOR SCHULS 7,5HP', 'Fabricante: SCHULS', 'W046', 2, 'HORAS EXCEDENTES'),
(255, 'COMPR/SCHULS 15HP', 'Fabricante: SCHULS', 'W047', 1, 'EM OPERAÇÃO'),
(256, 'COMPR/SCHULS 30HP', 'Fabricante: SCHULS', 'W048', 1, 'EM OPERAÇÃO'),
(257, 'COMPR/SCHULS 100HP', 'Fabricante: SCHULS', 'W049', 1, 'EM OPERAÇÃO'),
(258, 'V/CORPOS CILINDRICO 14\" a 48\"', 'N/A', 'W050', 1, 'OK'),
(259, 'V/CORPOS CILINDRICO 14\" a 48\"', 'N/A', 'W051', 1, 'OK'),
(260, 'V/CORPOS CILINDRICO 20\" a 60\"', 'N/A', 'W052', 1, 'HORAS EXCEDENTES');

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `agendamentos`
--
ALTER TABLE `agendamentos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `maquina_id` (`maquina_id`);

--
-- Índices de tabela `historico`
--
ALTER TABLE `historico`
  ADD PRIMARY KEY (`id`),
  ADD KEY `maquina_id` (`maquina_id`);

--
-- Índices de tabela `manutencoes`
--
ALTER TABLE `manutencoes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `maquina_id` (`maquina_id`);

--
-- Índices de tabela `maquinas`
--
ALTER TABLE `maquinas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `tag` (`tag`);

--
-- AUTO_INCREMENT para tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `agendamentos`
--
ALTER TABLE `agendamentos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT de tabela `historico`
--
ALTER TABLE `historico`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=72;

--
-- AUTO_INCREMENT de tabela `manutencoes`
--
ALTER TABLE `manutencoes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT de tabela `maquinas`
--
ALTER TABLE `maquinas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=261;

--
-- Restrições para tabelas despejadas
--

--
-- Restrições para tabelas `agendamentos`
--
ALTER TABLE `agendamentos`
  ADD CONSTRAINT `agendamentos_ibfk_1` FOREIGN KEY (`maquina_id`) REFERENCES `maquinas` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `historico`
--
ALTER TABLE `historico`
  ADD CONSTRAINT `historico_ibfk_1` FOREIGN KEY (`maquina_id`) REFERENCES `maquinas` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `manutencoes`
--
ALTER TABLE `manutencoes`
  ADD CONSTRAINT `manutencoes_ibfk_1` FOREIGN KEY (`maquina_id`) REFERENCES `maquinas` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
